'use strict';
// Experimental monkey patch in an isolated page ONLY; no change to application.
// Tests the shape of the proposed adapter against real scheduling and export.
const fs=require('fs'),path=require('path'),assert=require('assert'),puppeteer=require('puppeteer');
function source(file){return fs.readFileSync(path.join(__dirname,'../prototypes',file),'utf8');}
const bundle=`(()=>{
 const hand=(()=>{let module={exports:{}};${source('keyboard-hand-voicings.js')};return module.exports;})();
 const performance=(()=>{let module={exports:{}},require=()=>hand;${source('keyboard-performance.js')};return module.exports;})();
 const section=(()=>{let module={exports:{}},require=()=>performance;${source('keyboard-section-adapter.js')};return module.exports;})();
 const bridge=(()=>{let module={exports:{}},require=()=>section;${source('keyboard-runtime-bridge.js')};return module.exports;})();
 window.__experimentalBridge=bridge;
})();`;
(async()=>{const browser=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'/tmp/chromium',args:['--no-sandbox']});try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1440,height:900});
 await page.evaluateOnNewDocument(()=>localStorage.setItem('struchord-default-instrument','keys'));
 await page.goto(process.env.STRUCHORD_URL||'http://127.0.0.1:8024/STRUCHORD.html');await page.addScriptTag({content:bundle});
 const result=await page.evaluate(async()=>{
  startNewSongFromHome();addSection('Verse');const T=StruChordTracks,id=T.state().activeTrackId,s=sections[0],sq=s.squares[0];
  songStore.dispatch('test/chords',()=>['C','Am','F','G'].forEach((chord,i)=>sq.events[i].chord=chord));
  const original=StruChordAccomp, calls=[];
  function experimental(o) {
    if(o.pattern || !o.sec || !o.cell) return original.plan(o);
    const track=T.track(o.trackId), role=String(o.sec.type||'Verse').toLowerCase();
    const res=window.__experimentalBridge.prepareSection({section:o.sec,track,trackId:o.trackId,tracks:T,formula:StruChordFormula.chordFormula,globalKey,globalTimeSig,bpm:getEffectiveBpm(o.sec),genre:'pop',role,swing:false,seed:21});
    if(!res.ok || !res.events[o.cell]) {calls.push({fallback:true,reason:res.reason||'manual'});return original.plan(o);}
    const den=Number(String(o.ts||'4/4').split('/')[1])||4, factor=4/den, unit=(Number(o.dur)||1)/(Number(o.span)||1);
    let groups=[];
    if (o.noSwing) {
      const grouped=new Map();
      for(const n of res.events[o.cell]) {
        const at=Math.round(n.beat*4)/4,k=n.hand+':'+at;
        if(!grouped.has(k))grouped.set(k,{at,hand:n.hand,notes:[],dur:Infinity,velocity:0});
        const g=grouped.get(k);g.notes.push(n.midi);g.dur=Math.min(g.dur,Math.max(.25,Math.round(n.duration*4)/4));g.velocity+=n.velocity;
      }
      groups=[...grouped.values()].sort((a,b)=>a.at-b.at || a.hand.localeCompare(b.hand));
      for(let i=0;i<groups.length;i++){
        const g=groups[i],next=groups.slice(i+1).find(n=>n.hand===g.hand);
        g.dur=Math.min(g.dur,Number(o.span)*factor-g.at,next?next.at-g.at:Infinity);
        g.velocity/=g.notes.length;
      }
    } else groups=res.events[o.cell].map(n=>({at:n.beat,dur:n.duration,notes:[n.midi],velocity:n.velocity}));
    const steps=groups.filter(g=>g.dur>0).map((g,i)=>({index:i,stepIndex:i,at:g.at/factor*unit,dur:g.dur/factor*unit,notes:g.notes,gain:g.velocity/100,source:'section',type:'experimental'}));
    calls.push({cell:o.cell,count:steps.length,export:!!o.noSwing});return steps;
  }
  window.StruChordAccomp=Object.freeze(Object.assign({},original,{plan:experimental}));StruChordAudio.setPatternPlanner(experimental);
  const q=sq.events, cell=T.cellKey(s,sq,0),range=T.keyRange(id), track=T.track(id), notes=[36,48,52,55], span=q[0].span;
  const planned=experimental({trackId:id,cell,sec:s,sq,ev:q[0],ei:0,ts:'4/4',dur:span,span,chord:'C',key:'C',range,notes,noSwing:true});
  const exported=StruChordExport.stepsFor(track,cell,s,sq,q[0],0,'C','C',range,notes,span,'4/4');
  const ctx=getAudioContext();await ctx.resume();const before=StruChordAudio.stats().notes;
  StruChordAudio.scheduleEvent(ctx,s,sq,q[0],0,ctx.currentTime+.1,2,120,'4/4');const played=StruChordAudio.stats().notes-before;
  const parts=StruChordExport.buildParts({sections,globalKey,globalTimeSig}), gpParts=StruChordExport.buildParts({sections,globalKey,globalTimeSig},{gp5:true});
  const midi=window.midiExportBytes(), gp5=window.gpExportBytesGP5(), gpx=window.gpExportBytes();
  StruChordAudio.stopAll();window.StruChordAccomp=original;StruChordAudio.setPatternPlanner(original.plan);
  return {planned,exported,played,calls,rolls:parts[0].pitchRolls[s.id],gpRolls:gpParts[0].rolls[s.id],midi:Array.from(midi.bytes),gp5:Array.from(gp5.bytes),gpx:Array.from(gpx.bytes),gp5Report:gp5.report,gpxReport:gpx.report,cell,sections:JSON.parse(JSON.stringify(sections))};
 });
 assert(result.planned.length>0);assert.deepStrictEqual(result.exported,result.planned);assert.strictEqual(result.played,result.planned.reduce((n,s)=>n+s.notes.length,0),'audio scheduled each generated note');
 assert(result.calls.filter(x=>!x.fallback).length>=4,'prototype path exercised');
 // Export rounds the written grid to four decimal places.
 const round=n=>Math.round(n*1e4)/1e4;
 const expected=result.planned.flatMap(x=>x.notes.map(p=>[round(x.at),round(x.dur),p])).sort((a,b)=>a[0]-b[0]||a[2]-b[2]);
 const actual=result.rolls.filter(x=>x.start<4).map(n=>[round(n.start),round(n.dur),n.pitch]).sort((a,b)=>a[0]-b[0]||a[2]-b[2]);
 assert.deepStrictEqual(actual,expected,'application export model matches generator events');
 const midi=require('midi-file').parseMidi(Buffer.from(result.midi));
 let midiNotes=[];for(const tr of midi.tracks){let tick=0;for(const e of tr){tick+=e.deltaTime;if(e.type==='noteOn'&&e.velocity>0)midiNotes.push([tick,e.noteNumber]);}}
 const firstEvents=expected.map(e=>[Math.round(e[0]*midi.header.ticksPerBeat),e[2]]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 const firstActual=midiNotes.filter(e=>e[0]<4*midi.header.ticksPerBeat).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 assert.deepStrictEqual(firstActual,firstEvents,'actual MIDI note attacks match export model');
 const midiDur=[];
 for(const tr of midi.tracks){let tick=0,open=new Map();for(const e of tr){tick+=e.deltaTime;const k=e.channel+':'+e.noteNumber;
   if(e.type==='noteOn'&&e.velocity>0){const q=open.get(k)||[];q.push(tick);open.set(k,q);}
   else if(e.type==='noteOff'||(e.type==='noteOn'&&e.velocity===0)){const q=open.get(k)||[];if(q.length){const start=q.shift();if(start<4*midi.header.ticksPerBeat)midiDur.push([start,e.noteNumber,tick-start]);}}
 }}
 midiDur.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 assert.strictEqual(midiDur.length,expected.length);
 const expectedDur=expected.map(e=>[Math.round(e[0]*midi.header.ticksPerBeat),e[2],Math.round(e[1]*midi.header.ticksPerBeat)]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 for(let i=0;i<expectedDur.length;i++){assert.strictEqual(midiDur[i][0],expectedDur[i][0]);assert.strictEqual(midiDur[i][1],expectedDur[i][1]);assert(Math.abs(midiDur[i][2]-expectedDur[i][2])<=1,`MIDI duration: actual ${midiDur[i][2]}, expected ${expectedDur[i][2]}, event ${i}`);}
 const {readScore,gpifZip,notes}=require('./helpers/export-oracle'),codec=require('../gpx-bcfz-runtime');
 const entry=codec.readContainer(Uint8Array.from(result.gpx)).entries.find(e=>e.name==='score.gpif');
 const gp5=readScore(result.gp5),gpx=readScore(gpifZip(new TextDecoder().decode(entry.data||entry.bytes)));
 for(const [name,score] of [['GP5',gp5],['GPX',gpx]]){
   const actualPitches=notes(score,score.tracks[0].name).filter(n=>!n.tie).map(n=>n.pitch).sort((a,b)=>a-b);
   const expectedPitches=result.rolls.map(n=>n.pitch).sort((a,b)=>a-b);
   assert.deepStrictEqual(actualPitches,expectedPitches,name+' written attacks preserve pitches');
   if(name==='GP5') assert(!result.gp5Report.losses.some(x=>/оба голоса такта заняты/.test(x.label)),'two-hand test should not lose a voice');
   console.log(name+' written pitches match');
 }
 assert.deepStrictEqual(errors,[]);console.log(`Experimental browser injection: ${result.played} notes scheduled; real MIDI, GP5 and GPX checked; application unchanged`);
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});

'use strict';
// An isolated storage experiment, not a feature or an application release.
const fs=require('fs'),path=require('path'),assert=require('assert'),puppeteer=require('puppeteer');
const source=f=>fs.readFileSync(path.join(__dirname,'../prototypes',f),'utf8');
const bundle=`(()=>{const hand=(()=>{let module={exports:{}};${source('keyboard-hand-voicings.js')};return module.exports})();
const perf=(()=>{let module={exports:{}},require=()=>hand;${source('keyboard-performance.js')};return module.exports})();
const sec=(()=>{let module={exports:{}},require=()=>perf;${source('keyboard-section-adapter.js')};return module.exports})();
const bridge=(()=>{let module={exports:{}},require=()=>sec;${source('keyboard-runtime-bridge.js')};return module.exports})();
const draft=(()=>{let module={exports:{}};${source('keyboard-note-draft.js')};return module.exports})();
const storage=(()=>{let module={exports:{}},require=()=>draft;${source('keyboard-note-storage.js')};return module.exports})();window.__noteExperiment={bridge,draft,storage};})();`;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'/tmp/chromium',args:['--no-sandbox']});try{
 const p=await b.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1440,height:900});await p.evaluateOnNewDocument(()=>localStorage.setItem('struchord-default-instrument','keys'));await p.goto(process.env.STRUCHORD_URL||'http://127.0.0.1:8000/STRUCHORD.html');await p.addScriptTag({content:bundle});
 const fixture=await p.evaluate(()=>{startNewSongFromHome();addSection('Verse');const T=StruChordTracks,id=T.state().activeTrackId,s=sections[0],sq=s.squares[0];['C','Am','F','G'].forEach((c,i)=>sq.events[i].chord=c);
 const {bridge,draft,storage}=window.__noteExperiment;const g=bridge.prepareSection({section:s,track:T.track(id),trackId:id,tracks:T,formula:StruChordFormula.chordFormula,globalKey,globalTimeSig,bpm:getEffectiveBpm(s),genre:'pop',role:'verse',swing:false,seed:21});if(!g.ok)throw Error(g.reason);
 const specs=sq.events.map((e,i)=>({key:T.cellKey(s,sq,i),beats:e.span}));let d=draft.create(specs,g),n=d.cells[0].notes.map((x,i)=>i?x:{...x,velocity:42});d=draft.replaceCell(d,specs[0].key,n,0);return {id,specs,d,writes:storage.prepare(d,T.track(id).patterns)};});
 await wait(600);await p.evaluate(()=>captureHistorySnapshot());
 const ok=await p.evaluate(f=>songStore.dispatch('test/experimental-note-store',()=>f.writes.every(w=>StruChordTracks.setPattern(f.id,w.key,w.pattern)),{history:'atomic'}),fixture);assert(ok);
 const read=()=>p.evaluate(f=>window.__noteExperiment.storage.decode(f.specs,StruChordTracks.track(f.id).patterns),fixture);
 assert.deepStrictEqual((await read()).cells,fixture.d.cells,'native pattern storage keeps note data');
 await wait(600);await p.evaluate(()=>undoEdit());await wait(150);assert((await read()).cells.every(c=>c.status==='preserved'),'one undo removes the whole experiment');
 await p.evaluate(()=>redoEdit());await wait(150);assert.deepStrictEqual((await read()).cells,fixture.d.cells,'redo restores notes and manual status');
 await p.evaluate(async()=>{const file=await exportStruchordFile();localStorage.setItem('struchord_songs',JSON.stringify([file]));loadSong(0);});await wait(200);assert.deepStrictEqual((await read()).cells,fixture.d.cells,'real song serialization/load keeps individual notes');
 assert.deepStrictEqual(errors,[]);console.log('Experimental note storage: real song save/load and atomic undo/redo preserve notes — OK (isolated test only)');
 }finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});

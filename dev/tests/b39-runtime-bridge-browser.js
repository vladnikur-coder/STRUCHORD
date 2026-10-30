'use strict';
// Feeds real application's resolved chords, track and range into the isolated
// bridge. Does not patch or claim to exercise playback/UI integration.
const assert=require('assert'),puppeteer=require('puppeteer');
const {prepareSection}=require('../prototypes/keyboard-runtime-bridge');
(async()=>{const browser=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'/tmp/chromium',args:['--no-sandbox']});try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1440,height:900});
 await page.evaluateOnNewDocument(()=>localStorage.setItem('struchord-default-instrument','keys'));
 await page.goto(process.env.STRUCHORD_URL||'http://127.0.0.1:8024/STRUCHORD.html');
 const raw=await page.evaluate(()=>{startNewSongFromHome();addSection('Verse');const T=StruChordTracks,id=T.state().activeTrackId,s=sections[0],q=s.squares[0];
  songStore.dispatch('test/chords',()=>{['C','Am','F','G'].forEach((name,i)=>q.events[i].chord=name);});
  const keys=q.events.map((_,i)=>T.cellKey(s,q,i));T.setExactNotes(id,keys[1],'Am',[45,57,60,64]);
  T.setPattern(id,keys[2],{type:'keys-waltz',subdivision:1,steps:['B','R','R']});
  const track=T.track(id), chords={}, exact={}, formulas={};
  for(let i=0;i<q.events.length;i++){let cell=keys[i],chord=T.trackChord(id,cell,q.events[i]);chords[cell]=chord;exact[cell]=T.exactNotes(id,cell,chord);formulas[chord]=StruChordFormula.chordFormula(chord,'C');}
  return {id,track,section:s,range:T.keyRange(id),keys,chords,exact,formulas};
 });
 const make=(section=raw.section)=>({section,track:raw.track,trackId:raw.id,globalKey:'C',globalTimeSig:'4/4',bpm:90,genre:'pop',role:'verse',swing:false,seed:100,
   tracks:{cellKey:(s,q,i)=>`${s.id}:${q.id}:${i}`,trackChord:(id,cell)=>raw.chords[cell],keyRange:()=>raw.range,exactNotes:(id,cell)=>raw.exact[cell]},formula:name=>raw.formulas[name]});
 const before=JSON.stringify(raw), out=prepareSection(make());assert(out.ok,JSON.stringify(out));
 assert.deepStrictEqual(out.preserved,[raw.keys[1],raw.keys[2]]);
 assert.deepStrictEqual(Object.keys(out.events),[raw.keys[0],raw.keys[3]]);
 assert.strictEqual(JSON.stringify(raw),before,'does not mutate song or track');
 const compound=JSON.parse(JSON.stringify(raw.section));compound.timeSig='6/8';compound.squares[0].events.forEach(e=>e.span=6);
 const out6=prepareSection(make(compound));assert(out6.ok,JSON.stringify(out6));
 for(const ev of Object.values(out6.events))for(const n of ev)assert(n.beat+n.duration<=3+1e-8,'6/8 six eighths = three quarters');
 const repeated=JSON.parse(JSON.stringify(raw.section));repeated.squares[0].repeat=2;
 const repeatResult=prepareSection(make(repeated));assert(repeatResult.ok,JSON.stringify(repeatResult));
 for (const hand of ['left','right']) {
   const first=repeatResult.decisions[raw.keys[0]],last=repeatResult.decisions[raw.keys[3]];
   const center=a=>(a[0]+a[a.length-1])/2, distance=Math.abs(center(last[hand])-center(first[hand]));
   const limit=4-(distance?Math.max(.06,distance/20)*90/60:0);
   for(const n of repeatResult.events[raw.keys[3]].filter(n=>n.hand===hand)) assert(n.beat+n.duration<=limit+1e-8);
 }
 const repeatManual=JSON.parse(JSON.stringify(repeated));repeatManual.squares[0].events.unshift({chord:'Am',span:4});
 // Here the first boundary becomes unknown rather than silently guessed.
 const repeatManualInput=make(repeatManual);repeatManualInput.tracks={...repeatManualInput.tracks,trackChord:(id,cell)=>cell.endsWith(':0')?'Am':raw.chords[cell],exactNotes:(id,cell)=>cell.endsWith(':0')?[45,57,60,64]:raw.exact[cell]};
 assert.strictEqual(prepareSection(repeatManualInput).reason,'unknown-repeat-boundary');
 const mixed=JSON.parse(JSON.stringify(raw.section));mixed.squares[0].events[0].timeSig='3/4';assert.strictEqual(prepareSection(make(mixed)).reason,'mixed-meter');
 const fractional=JSON.parse(JSON.stringify(raw.section));fractional.squares[0].events[0].span=0.125;assert.strictEqual(prepareSection(make(fractional)).reason,'unsupported-duration');
 assert.deepStrictEqual(errors,[]);console.log('Real section bridge: formula and meter conversion, manual preservation, explicit unsupported cases — OK (prototype only)');
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});

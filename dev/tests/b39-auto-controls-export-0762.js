'use strict';
const assert=require('assert'),puppeteer=require('puppeteer'),{parseMidi}=require('midi-file');
const {readScore,gpifZip,notes}=require('./helpers/export-oracle'),codec=require('../gpx-bcfz-runtime');
(async()=>{const b=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'/tmp/chromium',args:['--no-sandbox']});try{
 const p=await b.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1440,height:900});await p.evaluateOnNewDocument(()=>localStorage.setItem('struchord-default-instrument','keys'));await p.goto(process.env.STRUCHORD_URL||'http://127.0.0.1:8000/STRUCHORD.html');
 const r=await p.evaluate(()=>{startNewSongFromHome();addSection('Verse');const T=StruChordTracks,s=sections[0],q=s.squares[0];q.events=[{chord:'C',span:4,timeSig:null}];let id=T.state().activeTrackId;
   T.setPattern(id,'s:'+s.id,StruChordAuto.makePattern(s,'pop',null,{variation:1}));T.setBassRole(id,s.id,'auto');T.setAutoAccomp({primary:'pop',secondary:null,trackId:id,managed:{[String(s.id)]:true},autoBass:true,swing:true});
   const part=StruChordExport.buildParts({sections,globalKey,globalTimeSig})[0], midi=midiExportBytes(),gp5=gpExportBytesGP5(),gpx=gpExportBytes();
   return{written:part.pitchRolls[s.id],midi:Array.from(midi.bytes),gp5:Array.from(gp5.bytes),gpx:Array.from(gpx.bytes),gp5loss:gp5.report.losses,gpxloss:gpx.report.losses};});
 const expected=r.written.map(n=>n.pitch).sort((a,b)=>a-b);assert(expected.length>0);
 const midi=parseMidi(Buffer.from(r.midi)),midiNotes=midi.tracks.flat().filter(x=>x.type==='noteOn'&&x.velocity>0).map(x=>x.noteNumber).sort((a,b)=>a-b);assert.deepStrictEqual(midiNotes,expected);
 const entry=codec.readContainer(Uint8Array.from(r.gpx)).entries.find(v=>v.name==='score.gpif');const scores=[['GP5',readScore(r.gp5)],['GPX',readScore(gpifZip(new TextDecoder().decode(entry.data||entry.bytes)))]];
 for(const [name,score] of scores)assert.deepStrictEqual(notes(score,score.tracks[0].name).filter(n=>!n.tie).map(n=>n.pitch).sort((a,b)=>a-b),expected,name+' actual notes');
 assert.deepStrictEqual(errors,[]);console.log('New auto: real MIDI, GP5 and GPX preserve written note attacks — OK');
 }finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});

/* Диагностический тест текущих ограничений 0.751, не нормы будущего поведения. */
const assert=require('assert'), puppeteer=require('puppeteer');
const {readScore,gpifZip,notes}=require('./helpers/export-oracle');
const codec=require('../gpx-bcfz-runtime'), {parseMidi}=require('midi-file');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'/tmp/chromium',args:['--no-sandbox']});try{
 const p=await b.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1440,height:900});await p.evaluateOnNewDocument(()=>localStorage.setItem('struchord-default-instrument','guitar'));await p.goto(process.env.STRUCHORD_URL||'http://127.0.0.1:8007/STRUCHORD.html');
 const ids=await p.evaluate(()=>{startNewSongFromHome();addSection('Verse');let s=sections[0],q=s.squares[0],ev=q.events[0],T=StruChordTracks;ev.chord='C';ev.fingering='x,3,2,0,1,0';let key=T.cellKey(s,q,0),id=T.addTrack('keys');T.setTrackChord(id,key,'Dm');T.setExactNotes(id,key,'Dm',[50,62,65,69]);requestRender();return{id,key}});await wait(150);await p.click('#btnModeToggle');await wait(250);
 const timeline=await p.evaluate(({id,key})=>{showPausedFingering(document.querySelector('.tl-cell'));return {main:sections[0].squares[0].events[0].chord,active:StruChordTracks.trackChord(id,key),cell:document.querySelector('.tl-cell-name').innerText,now:document.querySelector('#tlNowChord').innerText,keys:!!document.querySelector('#tlNowFing .b39-keys-svg'),controls:getComputedStyle(document.querySelector('.tl-fing-controls')).display}},ids);
 assert.deepStrictEqual(timeline,{main:'C',active:'Dm',cell:'C',now:'C',keys:true,controls:'none'});
 for(const capo of [0,2]){const r=await p.evaluate(async({capo,id})=>{setSongCapo(capo);let s=sections[0],q=s.squares[0],ctx=getAudioContext(),seen=[];await ctx.resume();StruChordAccomp.setStepObserver(x=>{if(x.trackId===id)seen=x.steps.flatMap(y=>y.notes)});StruChordAudio.scheduleEvent(ctx,s,q,q.events[0],0,ctx.currentTime+.1,1,120,'4/4');StruChordAccomp.setStepObserver(null);StruChordAudio.stopAll();let gp5=gpExportBytesGP5(),gpx=gpExportBytes(),midi=midiExportBytes();return {seen,freq:songStringFreqs(),gp5:gp5.bytes,gpx:gpx.bytes,midi:midi.bytes,losses:gp5.report.losses}}, {capo,...ids});
 assert.deepStrictEqual(r.seen,[50,62,65,69]);assert(Math.abs(r.freq[0]-(capo?92.4986:82.4069))<.01);
 const midi=parseMidi(r.midi);assert.deepStrictEqual(midi.tracks[1].filter(e=>e.type==='noteOn'&&e.velocity).map(e=>e.noteNumber),[36,48,52,55]);assert.deepStrictEqual(midi.tracks[2].filter(e=>e.type==='noteOn'&&e.velocity).map(e=>e.noteNumber),[50,62,65,69]);
 const f=codec.readContainer(Uint8Array.from(r.gpx)).entries.find(x=>x.name==='score.gpif'),xml=new TextDecoder().decode(f.data||f.bytes),gpXNotes=notes(readScore(gpifZip(xml)));assert.deepStrictEqual(gpXNotes.map(n=>n.pitch),[36,48,52,55,50,62,65,69]);
 const gp5notes=notes(readScore(r.gp5));assert.deepStrictEqual(gp5notes.map(n=>n.pitch),[36,48,62,50,65]);assert(r.losses.some(x=>/оба голоса такта заняты/.test(x.label)));
 }
 assert.deepStrictEqual(errors,[]);console.log('Аудит 0.751: лента, планирование и экспорт смешанной песни — воспроизведены текущие результаты');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});

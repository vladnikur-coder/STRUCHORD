/* Живой контракт будущего независимого строя (опт-ин: пока ожидаемо красный). */
const assert=require('assert'),puppeteer=require('puppeteer'),{parseMidi}=require('midi-file');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
if(process.env.B39_TEST_TUNING_CONTRACT!=='1'){
  console.log('Контракт независимого строя не включён: реализация ещё не готова');process.exit(0);
}
(async()=>{const b=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'/tmp/chromium',args:['--no-sandbox']});try{
 const p=await b.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());await p.setViewport({width:1440,height:900});await p.evaluateOnNewDocument(()=>localStorage.setItem('struchord-default-instrument','guitar'));await p.goto(process.env.STRUCHORD_URL||'http://127.0.0.1:8015/STRUCHORD.html');
 const setup=await p.evaluate(()=>{startNewSongFromHome();addSection('Verse');let s=sections[0],q=s.squares[0],e=q.events[0],T=StruChordTracks;e.chord='D';e.fingering='0,0,0,0,0,0';return{cell:T.cellKey(s,q,0)}});await wait(100);
 await p.click('#tuningPill');await p.click('#tuningPickerList [data-id="drop-d"]');
 const id=await p.evaluate(({cell})=>{let T=StruChordTracks,e=sections[0].squares[0].events[0];e.fingering='0,0,0,0,0,0';e.fingeringTuning=tuningKeySuffix();let id=T.addTrack('guitar');T.setTrackChord(id,cell,'D');T.setGuitarShape(id,cell,'D',[0,0,0,0,0,0],[],null);sections[0].strumPattern={mode:'pick',subdivision:1,steps:[[6],[6],[6],[6]]};return id},setup);
 async function pitches(){let raw=await p.evaluate(()=>midiExportBytes().bytes);return parseMidi(raw).tracks.slice(1).map(t=>t.find(e=>e.type==='noteOn'&&e.velocity)?.noteNumber);}
 async function sound(){return p.evaluate(async()=>{let ctx=getAudioContext();await ctx.resume();let heard=[],old=pluckString;pluckString=(c,o)=>heard.push(Math.round(69+12*Math.log2(o.freq/440)));try{playbackState.isPlaying=true;playbackState.currentSectionIndex=0;playbackState.currentSquareIndex=0;playbackState.currentEventIndex=0;playbackState._sectionRepeatCount={};playbackState._squareRepeatCount={};playbackState._structureWalk=null;nextEventTime=ctx.currentTime+.3;scheduleNextEvent(ctx);return heard}finally{stopPlayback();pluckString=old}});}
 // По согласованному правилу новая гитара — E Standard, старая — Drop D.
 assert.deepStrictEqual(await pitches(),[38,40],'новая гитара получает стандартный строй');
 assert.deepStrictEqual(await sound(),[38,38,38,38,40,40,40,40],'две гитары одновременно звучат в своих строях');
 await p.evaluate(()=>StruChordTracks.setActive(1));await wait(100);assert.match(await p.$eval('#tuningPillName',e=>e.textContent),/Drop D/);
 assert.deepStrictEqual(await pitches(),[38,40],'выбор активной дорожки не меняет экспорт');
 await p.evaluate(id=>StruChordTracks.setActive(id),id);await wait(100);assert.match(await p.$eval('#tuningPillName',e=>e.textContent),/E Standard/);
 await p.click('#tuningPill');await p.click('#tuningPickerList [data-id="drop-c"]');assert.deepStrictEqual(await pitches(),[38,36],'смена второй дорожки не трогает первую');
 await p.evaluate(async()=>{const file=await exportStruchordFile();localStorage.setItem('struchord_songs',JSON.stringify([file]));loadSong(0)});await wait(150);assert.deepStrictEqual(await pitches(),[38,36],'сохранение и загрузка');
 assert.deepStrictEqual(errors,[]);console.log('Независимый строй: UI, одновременное звучание, MIDI, сохранение и загрузка — OK');
 }finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});

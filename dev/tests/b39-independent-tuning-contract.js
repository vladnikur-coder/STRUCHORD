/* Живой контракт будущего независимого строя (опт-ин: пока ожидаемо красный). */
const assert=require('assert'),puppeteer=require('puppeteer'),{parseMidi}=require('midi-file');
const {readScore,gpifZip,notes}=require('./helpers/export-oracle'),codec=require('../gpx-bcfz-runtime');
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
 await wait(100);assert.match(await p.$eval('#tuningPillName',e=>e.textContent),/E Standard/,'при добавлении показывается строй новой дорожки');
 // По согласованному правилу новая гитара — E Standard, старая — Drop D.
 assert.deepStrictEqual(await pitches(),[38,40],'новая гитара получает стандартный строй');
 assert.deepStrictEqual(await sound(),[38,38,38,38,40,40,40,40],'две гитары одновременно звучат в своих строях');
 await p.evaluate(()=>StruChordTracks.setActive(1));await wait(100);assert.match(await p.$eval('#tuningPillName',e=>e.textContent),/Drop D/);
 assert.deepStrictEqual(await pitches(),[38,40],'выбор активной дорожки не меняет экспорт');
 await p.evaluate(id=>StruChordTracks.setActive(id),id);await wait(100);assert.match(await p.$eval('#tuningPillName',e=>e.textContent),/E Standard/);
 await p.click('#tuningPill');await p.click('#tuningPickerList [data-id="drop-c"]');assert.deepStrictEqual(await pitches(),[38,36],'смена второй дорожки не трогает первую');
 await p.evaluate(async()=>{const file=await exportStruchordFile();localStorage.setItem('struchord_songs',JSON.stringify([file]));loadSong(0)});await wait(150);assert.deepStrictEqual(await pitches(),[38,36],'сохранение и загрузка');
 // Независимые читатели фактических файлов GP5/GPX.
 const files=await p.evaluate(()=>({gp5:gpExportBytesGP5().bytes,gpx:gpExportBytes().bytes}));
 const entry=codec.readContainer(Uint8Array.from(files.gpx)).entries.find(x=>x.name==='score.gpif');
 const xml=new TextDecoder().decode(entry.data||entry.bytes);
 for(const score of [readScore(files.gp5),readScore(gpifZip(xml))]){
   const got=Array.from(score.tracks,t=>notes(score,t.name)[0].pitch);assert.deepStrictEqual(got,[38,36],'разные строи сохраняются в реальном GP');
 }
 // Старый пользовательский строй наследуют существовавшие гитары, но не новая.
 await p.evaluate(async()=>{const f=await exportStruchordFile();f.tuning='drop-d';f.tuningNotes=['C#2','A2','D3','G3','B3','E4'];for(const t of f.tracks)delete t.trackTuning;localStorage.setItem('struchord_songs',JSON.stringify([f]));loadSong(0)});await wait(150);
 assert.deepStrictEqual(await pitches(),[37,37],'старый ручной строй наследуется обеими дорожками');
 const third=await p.evaluate(({cell})=>{let T=StruChordTracks,id=T.addTrack('guitar');T.setTrackChord(id,cell,'D');T.setGuitarShape(id,cell,'D',[0,0,0,0,0,0],[],null);return id},setup);
 assert.deepStrictEqual(await pitches(),[37,37,40],'новая дорожка после старого файла получает стандарт');
 await p.evaluate(()=>setSongCapo(2));assert.deepStrictEqual(await pitches(),[39,39,42],'общий каподастр применяется к каждой гитаре');
 await p.evaluate(id=>StruChordTracks.setSolo(id,true),third);assert.deepStrictEqual(await pitches(),[42],'solo не меняет строй');await p.evaluate(id=>StruChordTracks.setSolo(id,false),third);
 await p.evaluate(()=>{captureHistorySnapshot();});await p.click('#tuningPill');await p.click('#tuningPickerList [data-id="drop-d"]');await wait(150);assert.deepStrictEqual(await pitches(),[39,39,40]);await p.click('#btnUndo');await wait(200);assert.deepStrictEqual(await pitches(),[39,39,42],'undo восстанавливает строй одной дорожки');
 // Перестановка главной переносит строй и форму вместе с дорожкой.
 await p.evaluate(()=>StruChordTracks.reorderTracks(2,0));assert.deepStrictEqual(await pitches(),[42,39,39],'строй следует за дорожкой при перестановке');
 await p.evaluate(()=>StruChordTracks.reorderTracks(0,2));assert.deepStrictEqual(await pitches(),[39,39,42]);
 // Временный контекст планирования обязан восстанавливаться даже при ошибке.
 const context=await p.evaluate(()=>{const before=songStringFreqs();try{b39WithTrackTuning(1,()=>{throw Error('test')})}catch(e){}return{before,after:songStringFreqs()}});assert.deepStrictEqual(context.after,context.before);
 assert.deepStrictEqual(errors,[]);console.log('Независимый строй: UI, одновременное звучание, MIDI, сохранение и загрузка — OK');
 }finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});

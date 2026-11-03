/* Диагностика 0.757: общий строй дорожек — НЕ ожидаемое новое поведение. */
const assert=require('assert'),puppeteer=require('puppeteer'),{parseMidi}=require('midi-file');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'/tmp/chromium',args:['--no-sandbox']});try{
 const p=await b.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());await p.setViewport({width:1440,height:900});await p.evaluateOnNewDocument(()=>localStorage.setItem('struchord-default-instrument','guitar'));await p.goto(process.env.STRUCHORD_URL||'http://127.0.0.1:8015/STRUCHORD.html');
 const setup=await p.evaluate(()=>{startNewSongFromHome();addSection('Verse');let s=sections[0],q=s.squares[0],e=q.events[0],T=StruChordTracks;e.chord='D';e.fingering='0,0,0,0,0,0';let cell=T.cellKey(s,q,0);return {cell}});await wait(150);
 await p.click('#tuningPill');await p.click('#tuningPickerList [data-id="drop-d"]');
 const a=await p.evaluate(async({cell})=>{let T=StruChordTracks,e=sections[0].squares[0].events[0];e.fingering='0,0,0,0,0,0';e.fingeringTuning=tuningKeySuffix();let id=T.addTrack('guitar');T.setTrackChord(id,cell,'D');T.setGuitarShape(id,cell,'D',[0,0,0,0,0,0],[],null);sections[0].strumPattern={mode:'pick',subdivision:1,steps:[[6],[6],[6],[6]]};return{id,state:T.state(),song:await exportStruchordFile()};},setup);
 if(a.state.tracks.some(t=>t.instrument==='guitar' && (Object.hasOwn(t,'trackTuning') || Object.hasOwn(t,'tuning') || Object.hasOwn(t,'tuningNotes')))){console.log('Диагностика 0.757 пропущена: модель строя изменилась');return;}
 // Новая гитара сейчас не хранит строй, хотя по решению должна получать E Standard.
 assert(!('tuning' in a.state.tracks[0]));assert(!('tuning' in a.state.tracks[1]));assert.equal(a.song.tuning,'drop-d');
 async function sound(){return p.evaluate(async()=>{let ctx=getAudioContext();await ctx.resume();let heard=[],old=pluckString;pluckString=(c,o)=>heard.push(Math.round(69+12*Math.log2(o.freq/440)));playbackState.isPlaying=true;playbackState.currentSectionIndex=0;playbackState.currentSquareIndex=0;playbackState.currentEventIndex=0;playbackState._sectionRepeatCount={};playbackState._squareRepeatCount={};playbackState._structureWalk=null;nextEventTime=ctx.currentTime+.3;scheduleNextEvent(ctx);stopPlayback();pluckString=old;return heard});}
 async function pitches(){let raw=await p.evaluate(()=>midiExportBytes().bytes);return parseMidi(raw).tracks.slice(1).map(t=>t.find(e=>e.type==='noteOn'&&e.velocity)?.noteNumber);}
 assert.deepStrictEqual(await sound(),[38,38,38,38,38,38,38,38]);assert.deepStrictEqual(await pitches(),[38,38]);
 // Старый файл с ручным строем: он должен остаться источником для всех уже существовавших гитар.
 const legacy=await p.evaluate(async()=>{let f=await exportStruchordFile();f.tuning='drop-d';f.tuningNotes=['C#2','A2','D3','G3','B3','E4'];for(const t of f.tracks||[])delete t.trackTuning;localStorage.setItem('struchord_songs',JSON.stringify([f]));loadSong(0);return songTuningNotes()});await wait(100);assert.deepStrictEqual(legacy,['C#2','A2','D3','G3','B3','E4']);assert.equal((await pitches())[0],37);assert.equal((await pitches())[1],37);
 // При выборе другого строя на второй дорожке меняется общий источник для обеих.
 await p.click('#tuningPill');await p.click('#tuningPickerList [data-id="e-std"]');
 await p.evaluate(({id,cell})=>{let e=sections[0].squares[0].events[0];e.fingering='0,0,0,0,0,0';e.fingeringTuning=tuningKeySuffix();StruChordTracks.setGuitarShape(id,cell,'D',[0,0,0,0,0,0],[],null)}, {...setup,id:a.id});
 assert.deepStrictEqual(await sound(),[40,40,40,40,40,40,40,40]);assert.deepStrictEqual(await pitches(),[40,40]);
 assert.deepStrictEqual(errors,[]);console.log('Диагностика 0.757: новый инструмент и обе партии используют общий строй — подтверждено');
 }finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});

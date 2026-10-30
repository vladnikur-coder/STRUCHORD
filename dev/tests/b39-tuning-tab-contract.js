/* Отдельный контракт сохранения старой таб-вставки при строе дорожки. */
const assert=require('assert'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer'),{parseMidi}=require('midi-file');
if(process.env.B39_TEST_TUNING_CONTRACT!=='1'){console.log('Контракт TAB/строя отключён до завершения реализации');process.exit(0)}
(async()=>{const b=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'/tmp/chromium',args:['--no-sandbox']});try{
 let p=await b.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());await p.goto(process.env.STRUCHORD_URL||'http://127.0.0.1:8017/STRUCHORD.html');let fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'../fixtures/b12-tab-insert.struchord'),'utf8'));await p.evaluate(x=>{localStorage.setItem('struchord_songs',JSON.stringify([x]));loadSong(0)},fixture);
 async function output(){let bytes=await p.evaluate(()=>midiExportBytes().bytes);return parseMidi(bytes).tracks.slice(1).map(t=>{let at=0;return t.flatMap(n=>{at+=n.deltaTime;return n.type==='noteOn'&&n.velocity?[`${at}:${n.noteNumber}`]:[]})});}
 let baseline=await output();assert.deepStrictEqual(baseline[0].slice(0,4),['0:40','960:43','1920:45','2880:48']);
 await p.evaluate(()=>{StruChordTracks.setTuning(1,{id:'drop-d',notes:null});onSongTuningChanged({silent:true})});let changed=await output();assert.deepStrictEqual(changed[0].slice(0,4),baseline[0].slice(0,4),'таб-вставка не исчезла из MIDI');
 let sound=await p.evaluate(async()=>{let ctx=getAudioContext();await ctx.resume();let old=pluckString,notes=[];pluckString=(c,o)=>notes.push(Math.round(69+12*Math.log2(o.freq/440)));try{playTabNote(0,0);return notes}finally{pluckString=old}});assert.deepStrictEqual(sound,[40],'старый строй таб-вставки не меняется вместе с активной дорожкой');
 assert.deepStrictEqual(errors,[]);console.log('TAB и независимый строй: MIDI и планирование старого строя — OK');
 }finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});

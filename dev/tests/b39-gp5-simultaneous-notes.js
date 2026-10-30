/* GP5: чтение настоящих байтов независимым alphaTab, а не только модели. */
const assert=require('assert'),puppeteer=require('puppeteer');
const {readScore,notes}=require('./helpers/export-oracle');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'/tmp/chromium',args:['--no-sandbox']});try{
 const p=await b.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());await p.setViewport({width:1440,height:900});await p.evaluateOnNewDocument(()=>localStorage.setItem('struchord-default-instrument','guitar'));await p.goto(process.env.STRUCHORD_URL||'http://127.0.0.1:8013/STRUCHORD.html');
 const ids=await p.evaluate(()=>{startNewSongFromHome();addSection('Verse');let s=sections[0],q=s.squares[0],T=StruChordTracks;q.events[0].chord='C';q.events[0].fingering='x,3,2,0,1,0';let cell=T.cellKey(s,q,0),keys=T.addTrack('keys');T.setTrackChord(keys,cell,'Dm');T.setExactNotes(keys,cell,'Dm',[50,62,65,69]);return {keys,cell}});await wait(150);
 const before=await p.evaluate(()=>JSON.stringify({sections,tracks:StruChordTracks.exportForSave()}));
 const emit=()=>p.evaluate(()=>{let r=gpExportBytesGP5();return {bytes:r.bytes,losses:r.report.losses}});
 const parsed=async()=>{let r=await emit();return {...r,notes:notes(readScore(r.bytes))}};
 let r=await parsed(), guitar=r.notes.filter(n=>n.track==='Гитара').map(n=>n.pitch).sort((a,b)=>a-b), piano=r.notes.filter(n=>n.track==='Клавиши').map(n=>n.pitch).sort((a,b)=>a-b);
 // Гитара экспортируется на своём строе; клавишное созвучие — отдельно.
 assert.deepStrictEqual(guitar,[48,52,55,60,64]);assert.deepStrictEqual(piano,[50,62,65,69]);assert(!r.losses.some(x=>/оба голоса такта заняты/.test(x.label)));
 assert(r.notes.every(n=>n.start===0 && n.dur===3840),'одновременные ноты и их длительность сохранены');assert.equal(await p.evaluate(()=>JSON.stringify({sections,tracks:StruChordTracks.exportForSave()})),before,'экспорт не изменяет песню');
 // Слишком плотное созвучие не помещается на двух голосах виртуального строя.
 await p.evaluate(({keys,cell})=>StruChordTracks.setExactNotes(keys,cell,'Dm',[60,61,62,63,64,65,66]),ids);
 r=await parsed();piano=r.notes.filter(n=>n.track==='Клавиши').map(n=>n.pitch);assert(piano.length<7);assert(r.losses.some(x=>/не помещаются на виртуальных струнах/.test(x.label)),'невместившиеся ноты указаны в отчёте');assert(piano.every(n=>n>=60&&n<=66));
 // Слишком низкие ноты, как и раньше, сдвигаются с предупреждением.
 await p.evaluate(({keys,cell})=>StruChordTracks.setExactNotes(keys,cell,'Dm',[24,48,60]),ids);r=await parsed();piano=r.notes.filter(n=>n.track==='Клавиши').map(n=>n.pitch).sort((a,b)=>a-b);assert.deepStrictEqual(piano,[36,48,60]);assert(r.losses.some(x=>/ниже C2 подняты на октаву/.test(x.label)));
 await p.evaluate(({keys,cell})=>StruChordTracks.setExactNotes(keys,cell,'Dm',[107,108,120,127]),ids);r=await parsed();piano=r.notes.filter(n=>n.track==='Клавиши').map(n=>n.pitch).sort((a,b)=>a-b);assert.deepStrictEqual(piano,[107,108,120,127]);
 // MIDI/GPX остаются отдельными путями; чтение данных и выбор дорожки песню не изменяют.
 assert.deepStrictEqual(errors,[]);console.log('GP5: одновременные ноты, точные высоты и честные предупреждения — OK');
 }finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});

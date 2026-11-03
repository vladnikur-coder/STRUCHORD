/* B-39: единственный размер клавиатуры — свойство активной дорожки. */
const assert=require('assert'),puppeteer=require('puppeteer');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'/tmp/chromium',args:['--no-sandbox']});try{
 const p=await b.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:390,height:844});
 await p.evaluateOnNewDocument(()=>localStorage.setItem('struchord-default-instrument','keys'));
 await p.goto(process.env.STRUCHORD_URL||'http://127.0.0.1:8000/STRUCHORD.html',{waitUntil:'load'});
 await p.evaluate(()=>{startNewSongFromHome();addSection('Verse');addSection('Chorus');sections.forEach(s=>s.squares[0].events[0].chord='C');});
 // Старый сохранённый файл: общий резервный размер 49, у первой дорожки нет явного размера.
 const original=await p.evaluate(()=>{const T=StruChordTracks;T.setKeyboardSize(49);const other=T.addTrack('keys');T.setTrackKeyboardSize(other,88);T.setActive(1);return {other,saved:JSON.stringify(T.exportForSave())};});
 await p.evaluate(()=>StruChordKeys.open());
 assert.equal(await p.$eval('#b39KeysTrackSize',e=>e.value),'49','наследованный размер показывается числом');
 assert.equal(await p.evaluate(()=>JSON.stringify(StruChordTracks.exportForSave())),original.saved,'открытие не меняет старый файл');
 assert.equal(await p.$eval('#b39KeysPanel',e=>e.querySelectorAll('select[aria-label*="Размер клавиатуры"]').length),1,'в панели один выбор размера');
 assert(!await p.$eval('#b39KeysPanel',e=>/Как в песне|Размер песни/.test(e.textContent)));
 assert.deepStrictEqual(await p.$$eval('#b39KeysTrackSize option',es=>es.map(e=>e.value)),['25','37','49','61','76','88']);
 await p.click('#b39KeysSettingsToggle');
 await p.evaluate(()=>captureHistorySnapshot());await p.select('#b39KeysTrackSize','76');await p.evaluate(()=>captureHistorySnapshot());
 let after=await p.evaluate(id=>({state:StruChordTracks.state(),range:StruChordTracks.keyRange(1),other:StruChordTracks.track(id),sections:sections.map(s=>({id:s.id,chord:s.squares[0].events[0].chord}))}),original.other);
 assert.equal(after.state.tracks[0].keyboardSize,76);assert.equal(after.state.keyboardSize,49);assert.equal(after.other.keyboardSize,88);
 assert.equal(after.range.size,76);assert(after.sections.every(s=>s.chord==='C'),'аккорды в обеих секциях не изменились');
 await p.evaluate(()=>undoEdit());await wait(150);assert.equal(await p.$eval('#b39KeysTrackSize',e=>e.value),'49');assert.equal((await p.evaluate(()=>StruChordTracks.track(1))).keyboardSize,null,'undo сохраняет старое наследование');
 await p.evaluate(()=>redoEdit());await wait(150);assert.equal(await p.$eval('#b39KeysTrackSize',e=>e.value),'76');
 await p.evaluate(id=>StruChordTracks.setActive(id),original.other);await wait(150);assert.equal(await p.$eval('#b39KeysTrackSize',e=>e.value),'88','при смене дорожки показан её размер');
 await p.select('#b39KeysTrackSize','37');assert.equal((await p.evaluate(()=>StruChordTracks.track(1))).keyboardSize,76);assert.equal((await p.evaluate(id=>StruChordTracks.track(id),original.other)).keyboardSize,37);
 const saved=await p.evaluate(()=>{const T=StruChordTracks,raw={sections:JSON.parse(JSON.stringify(sections)),...T.exportForSave()};return T.attach(raw,raw)});
 assert.equal(saved.keyboardSize,49);assert.deepStrictEqual(saved.tracks.map(t=>t.keyboardSize),[76,37]);
 assert.deepStrictEqual(errors,[]);console.log('B-39: один размер дорожки, старые файлы, независимость и история — OK');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});

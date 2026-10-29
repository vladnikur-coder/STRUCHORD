/* Наведение на компьютерной сетке, а не движение мыши по каждому пикселю. */
const assert=require('assert'), puppeteer=require('puppeteer');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'/tmp/chromium',args:['--no-sandbox']});try{
 const p=await b.newPage(), errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1440,height:900});
 await p.evaluateOnNewDocument(()=>{localStorage.setItem('struchord-default-instrument','keys');localStorage.setItem('struchord-ui-scale','125');});
 await p.goto(process.env.STRUCHORD_URL||'http://127.0.0.1:8000/STRUCHORD.html');
 await p.evaluate(()=>{startNewSongFromHome();addSection('Verse');songStore.dispatch('test/chords',()=>{let e=sections[0].squares[0].events;e[0].chord='C';e[1].chord='G';e[2].chord='Am';});document.querySelector('#showFingering').checked=false;StruChordKeys.open();});await wait(300);
 const key=await p.evaluate(()=>StruChordTracks.cellKey(sections[0],sections[0].squares[0],0));await p.evaluate(k=>StruChordKeys.focusCell(k),key);
 const before=await p.evaluate(()=>JSON.stringify(StruChordTracks.exportForSave()));
 const get=()=>p.evaluate(()=>{const panel=document.querySelector('#b39KeysPanel');return {last:StruChordKeys.last(),ctx:panel.querySelector('.b39-keys-context').textContent,bass:panel.querySelector('.b39-keys-bass').textContent,head:panel.querySelector('.b39-keys-head').getBoundingClientRect().toJSON(),bassRect:panel.querySelector('.b39-keys-bass').getBoundingClientRect().toJSON(),ctxRect:panel.querySelector('.b39-keys-context').getBoundingClientRect().toJSON(),panel:panel.getBoundingClientRect().toJSON()};});
 let d=await get();assert.equal(d.last.chord,'C');assert.match(d.ctx,/Куплет.*ячейка 1/);assert(!d.ctx.includes('Клавиши'));assert.match(d.bass,/бас/);assert(d.bassRect.left>=d.ctxRect.right-1 && d.bassRect.top<d.head.bottom);
 const sel=i=>`.chord-wrapper[data-ei="${i}"]`;
 await p.hover(sel(1));await wait(120);d=await get();assert.equal(d.last.chord,'G');assert.match(d.ctx,/ячейка 2/);assert.equal(await p.evaluate(()=>JSON.stringify(StruChordTracks.exportForSave())),before,'наведение не меняет данные');
 // Мышь по потомкам одной ячейки не должна снова строить клавиатуру.
 await p.evaluate(()=>{window.__svgWrites=0;window.__hoverObs=new MutationObserver(()=>window.__svgWrites++);window.__hoverObs.observe(document.querySelector('.b39-keys-body'),{childList:true});});
 await p.hover(sel(1)+' .chord-input');await wait(80);assert.equal(await p.evaluate(()=>window.__svgWrites),0,'повторные события той же ячейки не перерисовывают');
 await p.hover(sel(2));await wait(100);assert.equal((await get()).last.chord,'Am');
 // Из ячейки можно перейти к управлению, не потеряв просматриваемый аккорд.
 await p.hover('#b39KeysSettingsToggle');await wait(450);assert.equal((await get()).last.chord,'Am');
 await p.mouse.move(10,850);await wait(400);assert.equal((await get()).last.chord,'C','после ухода восстановлен исходный аккорд');
 await p.evaluate(()=>{playbackState.isPlaying=true;});await p.hover(sel(1));await wait(100);assert.equal((await get()).last.chord,'C','воспроизведение имеет приоритет над наведением');await p.evaluate(()=>{playbackState.isPlaying=false;});
 // Для второй клавишной дорожки используем её собственный аккорд, а не подпись главной.
 await p.evaluate(()=>{document.getElementById('showFingering').checked=true;});await p.mouse.move(10,850);await p.hover(sel(1));await wait(120);assert.equal(await p.$eval('#fingering-tooltip',e=>getComputedStyle(e).display),'none','при открытой клавиатуре нет второго всплывающего окна');
 // Уведомление плеера забирает управление даже во время наведения.
 await p.evaluate(k=>StruChordKeys.focusCell(k),key);assert.equal((await get()).last.chord,'C');
 const id=await p.evaluate(()=>{let t=StruChordTracks,s=sections[0],q=s.squares[0],id=t.addTrack('keys');t.setTrackChord(id,t.cellKey(s,q,1),'Dm');return id;});await wait(180);
 await p.mouse.move(10,850);await p.hover(sel(1));await wait(100);d=await get();assert.equal(d.last.trackId,id);assert.equal(d.last.chord,'Dm');
 // Отмена показа или закрытие панели не меняют данные.
 const second=await p.evaluate(()=>JSON.stringify(StruChordTracks.exportForSave()));await p.mouse.move(10,850);await wait(350);await p.evaluate(()=>StruChordKeys.close());assert.equal(await p.evaluate(()=>JSON.stringify(StruChordTracks.exportForSave())),second);
 assert.deepStrictEqual(errors,[]);await p.close();console.log('B-39: наведение, дорожки, выход, управление и воспроизведение — OK');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});

/* 0.790 · B-118: голосоведение по всей песне — prev перетекает через границы секций. */
const assert=require('assert'),puppeteer=require('puppeteer');
(async()=>{const browser=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'/tmp/chromium',args:['--no-sandbox']});try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:390,height:844});
 await page.goto(process.env.STRUCHORD_URL||'http://127.0.0.1:8000/STRUCHORD.html');await page.evaluate(()=>localStorage.setItem('struchord-default-instrument','keys'));await page.reload();
 await page.evaluate(()=>{startNewSongFromHome();addSection('Verse');addSection('Chorus');addSection('Verse2');
  songStore.dispatch('test/chords',()=>{
   const a=sections[0].squares[0].events,b=sections[1].squares[0].events,c=sections[2].squares[0].events;
   ['E','G#m','C#m','B'].forEach((ch,i)=>a[i].chord=ch);
   ['C','G','Am','F'].forEach((ch,i)=>b[i].chord=ch);
   ['E','G#m','C#m','B'].forEach((ch,i)=>c[i].chord=ch);
  });});
 // Первая ячейка второй секции зависит от последнего аккорда первой секции.
 const cross=await page.evaluate(()=>{const K=StruChordKeys,T=StruChordTracks,s1=sections[1],sq=s1.squares[0];const cell=T.cellKey(s1,sq,0);const first=K.linkedSelection(1,cell);return {first:first.notes,lastA:K.linkedSelection(1,T.cellKey(sections[0],sections[0].squares[0],3)).notes,cell};});
 const afterChange=await page.evaluate(cell=>{songStore.dispatch('test/lastA',()=>{sections[0].squares[0].events[3].chord='E';});const K=StruChordKeys,T=StruChordTracks,s1=sections[1],sq=s1.squares[0];return {first:K.linkedSelection(1,cell).notes,lastA:K.linkedSelection(1,T.cellKey(sections[0],sections[0].squares[0],3)).notes};},cross.cell);
 assert.notDeepStrictEqual(afterChange.first,cross.first,'смена последнего аккорда секции A меняет первый выбор секции B (prev перетекает через границу)');
 assert.equal(afterChange.lastA[0]%12,4,'бас последнего аккорда A — E');assert(afterChange.lastA.every(n=>[4,8,11].includes(n%12)),'последний аккорд A действительно E');
 // Детерминизм: произвольный порядок чтения по всей песне даёт тот же выбор.
 const det=await page.evaluate(()=>{const K=StruChordKeys,T=StruChordTracks;const cells=[];sections.forEach(s=>s.squares.forEach(sq=>sq.events.forEach((e,i)=>cells.push(T.cellKey(s,sq,i)))));const fwd=cells.map(k=>K.linkedSelection(1,k).notes);const rev=cells.slice().reverse().map(k=>K.linkedSelection(1,k).notes);return {fwd,rev,cells};});
 assert.deepStrictEqual(det.rev,det.fwd.slice().reverse(),'обход в обратном порядке = прямой обход по всей песне');
 // Повтор секции (та же гармония в секции 3) даёт те же ноты, что первый проход.
 const rep=await page.evaluate(cells=>{const K=StruChordKeys,T=StruChordTracks;const a=cells.slice(0,4).map(k=>K.linkedSelection(1,k).notes),c=cells.slice(8,12).map(k=>K.linkedSelection(1,k).notes);return {a,c};},det.cells);
 assert.deepStrictEqual(rep.c,rep.a,'повтор секции получает тот же выбор, что первый проход (детерминизм звука/экспорта)');
 // Ручной выбор последнего аккорда секции A становится опорой для секции B.
 const manual=await page.evaluate(cell=>{StruChordTracks.setVoicingForChord(1,'E',1);const K=StruChordKeys,T=StruChordTracks;const last=K.linkedSelection(1,T.cellKey(sections[0],sections[0].squares[0],3));const first=K.linkedSelection(1,cell);return {lastManual:last.manual,first:first.notes};},det.cells[4]);
 assert.equal(manual.lastManual,true,'ручной индекс на последнем аккорде A применён');
 assert(manual.first.every(n=>{const f=StruChordFormula.chordFormula('C','C');return f.pitchClasses.includes(n%12);}),'первый аккорд B — ступени C');
 // Транспорт второй секции играет тот же выбор, что linkedSelection.
 const sound=await page.evaluate(async cell=>{const T=StruChordTracks,s=sections[1],sq=s.squares[0],ev=sq.events[0],A=StruChordAccomp,ctx=getAudioContext();await ctx.resume();T.setPattern(1,T.cellKey(s,sq,0),{type:'keys-block',subdivision:1,steps:['H']});let steps;A.setStepObserver(x=>steps=x.steps);StruChordAudio.scheduleEvent(ctx,s,sq,ev,1,ctx.currentTime+.1,1,120,'4/4');A.setStepObserver(null);StruChordAudio.stopAll();return {notes:steps[0].notes,selected:StruChordKeys.linkedSelection(1,cell).notes};},det.cells[4]);
 assert.deepStrictEqual(sound.notes,sound.selected,'звук первой ячейки секции B = выбор голосоведения');
 // Без галочки (старая песня) выбора нет — прежнее поведение.
 const off=await page.evaluate(cell=>{StruChordTracks.setLinkedVoicings(1,false);const r=StruChordKeys.linkedSelection(1,cell);StruChordTracks.setLinkedVoicings(1,true);return r;},det.cells[4]);
 assert.equal(off,null,'без linkedVoicings голосоведение не применяется');
 assert.deepStrictEqual(errors,[]);console.log('0.790 B-118: prev через границы секций, повторы детерминированы, ручной выбор и старый режим сохранены — OK');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});

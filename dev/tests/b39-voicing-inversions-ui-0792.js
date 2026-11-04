/* 0.792 · B-119 rework: стрелки по обращениям, тоггл «Плотно|Широко», умолчание — основное положение. */
const assert=require('assert'),puppeteer=require('puppeteer');
(async()=>{const browser=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'/tmp/chromium',args:['--no-sandbox']});try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:390,height:844});
 await page.goto(process.env.STRUCHORD_URL||'http://127.0.0.1:8000/STRUCHORD.html');await page.evaluate(()=>localStorage.setItem('struchord-default-instrument','keys'));await page.reload();
 await page.evaluate(()=>{startNewSongFromHome();addSection('Verse');songStore.dispatch('test/chords',()=>{const ev=sections[0].squares[0].events;['C','G','Am','F'].forEach((c,i)=>{ev[i].chord=c;});});});
 // Список обращений: C -> основное первым (бас C + C E G), Am -> A C E с басом A.
 const defs=await page.evaluate(()=>{const K=StruChordKeys,T=StruChordTracks,range=T.keyRange(1);const stC=K.voicingVariantStructure('C','C',range),stAm=K.voicingVariantStructure('Am','C',range);return {c0:stC.list[0],am0:stAm.list[0],cSlots:stC.slots.length,amSlots:stAm.slots.length,wide:stC.slots.map(s=>s.wide)};});
 assert.deepStrictEqual(defs.c0,[36,48,52,55],'C умолчание = бас C + C E G');
 assert.deepStrictEqual(defs.am0,[45,57,60,64],'Am умолчание = бас A + A C E');
 assert(defs.cSlots>=3,'у C минимум 3 обращения');
 assert(defs.wide.some(w=>w>=0),'на 61 клавише широкие слоты есть');
 // Панель: стрелка › переключает на следующее обращение, индекс сохраняется, звук = тому же списку.
 await page.evaluate(()=>{StruChordKeys.open();const T=StruChordTracks,s=sections[0],sq=s.squares[0];StruChordKeys.focusCell(T.cellKey(s,sq,0));});
 const before=await page.evaluate(()=>{const K=StruChordKeys,T=StruChordTracks,s=sections[0],sq=s.squares[0],cell=T.cellKey(s,sq,0);return {stored:T.track(1).voicings['v:C']??null,sel:K.linkedSelection(1,cell)&&K.linkedSelection(1,cell).notes,count:document.querySelector('.b39-keys-count').textContent};});
 await page.click('button[aria-label="Следующая позиция"]');
 const after=await page.evaluate(()=>{const K=StruChordKeys,T=StruChordTracks,s=sections[0],sq=s.squares[0],cell=T.cellKey(s,sq,0);const st=K.voicingVariantStructure('C','C',T.keyRange(1));return {stored:T.track(1).voicings['v:C'],sel:K.linkedSelection(1,cell),count:document.querySelector('.b39-keys-count').textContent,list:st.list,slots:st.slots};});
 assert(Number.isInteger(after.stored),'ручной индекс сохранён (v:C)');
 assert.equal(after.sel.manual,true,'linkedSelection ручной');
 assert.deepStrictEqual(after.sel.notes,after.list[after.stored],'звук резолвится по тому же списку обращений');
 assert.equal(after.sel.notes.join(','),after.list[after.slots[1].base].join(','),'стрелка › = обращение 2 (E G C с басом C)');
 assert.match(after.count,/обращение 2\/\d+ · плотно/,'счётчик «обращение 2/N · плотно»');
 // Тоггл «Широко»: верхняя нота RH +12, индекс = широкий слот того же обращения.
 await page.click('#b39KeysDensity .b39-density-btn:last-child');
 const wide=await page.evaluate(()=>{const K=StruChordKeys,T=StruChordTracks,s=sections[0],sq=s.squares[0],cell=T.cellKey(s,sq,0);const st=K.voicingVariantStructure('C','C',T.keyRange(1));const sel=K.linkedSelection(1,cell);return {stored:T.track(1).voicings['v:C'],sel,pressed:document.querySelector('#b39KeysDensity .b39-density-btn:last-child').getAttribute('aria-pressed'),count:document.querySelector('.b39-keys-count').textContent,slot:st.slots[1]};});
 assert.equal(wide.pressed,'true','кнопка Широко активна');
 assert.equal(wide.stored,wide.slot.wide,'индекс = широкий слот обращения 2');
 const baseNotes=after.sel.notes, wideNotes=wide.sel.notes;
 assert.equal(wideNotes.length,baseNotes.length+1,'широко = +1 нота');
 assert.equal(Math.max.apply(null,wideNotes),Math.max.apply(null,baseNotes)+12,'широко = верхняя нота +12');
 assert.match(wide.count,/широко/,'счётчик показывает «широко»');
 // Обратно «Плотно».
 await page.click('#b39KeysDensity .b39-density-btn:first-child');
 const tight=await page.evaluate(()=>{const T=StruChordTracks,s=sections[0],sq=s.squares[0],cell=T.cellKey(s,sq,0);return {stored:T.track(1).voicings['v:C'],pressed:document.querySelector('#b39KeysDensity .b39-density-btn:first-child').getAttribute('aria-pressed')};});
 assert.equal(tight.stored,wide.slot.base,'тоггл назад = базовый слот обращения 2');
 assert.equal(tight.pressed,'true','Плотно активна');
 // На 25 клавишах тоггл скрыт.
 await page.evaluate(()=>StruChordTracks.setTrackKeyboardSize(1,25));
 const small=await page.evaluate(()=>{const K=StruChordKeys,T=StruChordTracks,s=sections[0],sq=s.squares[0];StruChordKeys.focusCell(T.cellKey(s,sq,0));const st=K.voicingVariantStructure('C','C',T.keyRange(1));return {wide:st.slots.some(x=>x.wide>=0),cls:document.getElementById('b39KeysPanel').classList.contains('has-wide')};});
 assert.equal(small.wide,false,'25 клавиш: широких нет');
 assert.equal(small.cls,false,'25 клавиш: тоггл скрыт (нет has-wide)');
 await page.evaluate(()=>StruChordTracks.setTrackKeyboardSize(1,null));
 // exactNotes побеждает над стрелками/тогглом.
 const exact=await page.evaluate(()=>{const T=StruChordTracks,s=sections[0],sq=s.squares[0],cell=T.cellKey(s,sq,0);T.setExactNotes(1,cell,'C',[40,52,55,59]);const sel=StruChordKeys.linkedSelection(1,cell);return {exact:sel.exact,notes:sel.notes,count:document.querySelector('.b39-keys-count').textContent};});
 assert.equal(exact.exact,true,'exactNotes побеждает');
 assert.deepStrictEqual(exact.notes,[40,52,55,59],'ручные ноты ровно как введены');
 assert.deepStrictEqual(errors,[]);console.log('0.792 B-119 rework: умолчание — основное положение, стрелки по обращениям, тоггл плотно/широко (+октава), ручной выбор сохраняется — OK');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});

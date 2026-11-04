/* 0.791 · B-119: карточки вариантов расположения в панели клавишных. */
const assert=require('assert'),puppeteer=require('puppeteer');
(async()=>{const browser=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'/tmp/chromium',args:['--no-sandbox']});try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:390,height:844});
 await page.goto(process.env.STRUCHORD_URL||'http://127.0.0.1:8000/STRUCHORD.html');await page.evaluate(()=>localStorage.setItem('struchord-default-instrument','keys'));await page.reload();
 await page.evaluate(()=>{startNewSongFromHome();addSection('Verse');songStore.dispatch('test/chords',()=>{const ev=sections[0].squares[0].events;['C','G','Am','F'].forEach((c,i)=>{ev[i].chord=c;});});});
 // На 61 клавише (дефолт) карточек больше, чем базовых вариантов: широкие в хвосте.
 const cards61=await page.evaluate(()=>{StruChordKeys.open();const T=StruChordTracks,T2=T,s=sections[0],sq=s.squares[0],cell=T2.cellKey(s,sq,0);T2.setLinkedVoicings(1,false);StruChordKeys.focusCell(cell);const range=T2.keyRange(1);const basic=StruChordKeys.generateKeysVoicings('C','C',range,null,{}).length;const list=StruChordKeys.listVoicingVariants('C','C',range,null,{}).length;const dom=document.querySelectorAll('#b39KeysVariants .b39-variant').length;return {basic,list,dom};});
 assert(cards61.list>cards61.basic,'широкие добавлены в список (61 клавиша)');
 assert.equal(cards61.dom,cards61.list,'в DOM по карточке на вариант');
 assert(cards61.dom>1,'карточек больше одной');
 const labels=await page.$$eval('#b39KeysVariants .b39-variant .b39-variant-label',els=>els.map(e=>e.textContent));
 assert(labels.some(l=>l.includes('Широкое')),'среди подписей есть «Широкое»');
 // Клик по карточке выбирает вариант: модель + linkedSelection ручной.
 await page.evaluate(()=>{document.querySelectorAll('#b39KeysVariants .b39-variant')[1].click();});
 const picked=await page.evaluate(()=>{const T=StruChordTracks,s=sections[0],sq=s.squares[0],cell=T.cellKey(s,sq,0);const sel=StruChordKeys.linkedSelection(1,cell);return {manual:sel.manual,idx:sel.index,stored:T.track(1).voicings['v:C']};});
 assert.equal(picked.manual,true,'выбор карточкой ручной');
 assert.equal(picked.stored,picked.idx,'индекс сохранён в модели (v:C)');
 assert.equal(await page.$eval('#b39KeysVariants .b39-variant[aria-pressed="true"] .b39-variant-label',e=>e.textContent),labels[1],'активная карточка подсвечена');
 // ± ходят по тому же списку, что и карточки.
 const step=await page.evaluate(async()=>{const T=StruChordTracks,s=sections[0],sq=s.squares[0],cell=T.cellKey(s,sq,0);const before=T.track(1).voicings['v:C'];StruChordKeys.stepVariant(1);const after=T.track(1).voicings['v:C'];const list=StruChordKeys.listVoicingVariants('C','C',T.keyRange(1),null,{}).length;return {before,after,list};});
 assert.equal((step.after-step.before+step.list)%step.list,1,'шаг +1 по тому же циклу');
 // На 25 клавишах широких нет: карточек ровно столько, сколько базовых.
 await page.evaluate(()=>{StruChordTracks.setTrackKeyboardSize(1,25);StruChordKeys.renderPanel&&StruChordKeys.renderPanel();});
 const cards25=await page.evaluate(()=>{const T=StruChordTracks,s=sections[0],sq=s.squares[0],cell=T.cellKey(s,sq,0);StruChordKeys.focusCell(cell);const range=T.keyRange(1);return {basic:StruChordKeys.generateKeysVoicings('C','C',range,null,{}).length,list:StruChordKeys.listVoicingVariants('C','C',range,null,{}).length,dom:document.querySelectorAll('#b39KeysVariants .b39-variant').length};});
 assert.equal(cards25.list,cards25.basic,'25 клавиш: список = база');
 assert.equal(cards25.dom,cards25.list,'25 клавиш: карточек как вариантов');
 await page.evaluate(()=>StruChordTracks.setTrackKeyboardSize(1,null));
 // exactNotes побеждает над карточками.
 const exact=await page.evaluate(()=>{const T=StruChordTracks,s=sections[0],sq=s.squares[0],cell=T.cellKey(s,sq,0);T.setExactNotes(1,cell,'C',[40,52,55,59]);const sel=StruChordKeys.linkedSelection(1,cell);const count=document.querySelector('#b39KeysVariants .b39-variant[aria-pressed="true"]');return {exact:sel.exact,notes:sel.notes,pressed:count?count.getAttribute('aria-label'):null};});
 assert.equal(exact.exact,true,'exactNotes ручной расчёт побеждает');
 assert.deepStrictEqual(exact.notes,[40,52,55,59],'ноты ровно ручные');
 assert.equal(exact.pressed,null,'при ручных нотах ни одна карточка не «активная» в прежнем смысле — выбор «Своя»');
 // Старый ручной индекс (сохранённый до 0.791) не сдвигается: широкие в хвосте.
 const stable=await page.evaluate(()=>{const T=StruChordTracks,s=sections[0],sq=s.squares[0],cell=T.cellKey(s,sq,0);T.setExactNotes(1,cell,'C',null);T.clearExactNotes(1,cell);T.setVoicingForChord(1,'C',0);const range=T.keyRange(1);const basic=StruChordKeys.generateKeysVoicings('C','C',range,null,{});const list=StruChordKeys.listVoicingVariants('C','C',range,null,{});const sel=StruChordKeys.linkedSelection(1,cell);return {basic0:basic[0],sel:sel.notes,list0:list[0]};});
 assert.deepStrictEqual(stable.sel,stable.basic0,'индекс 0 по-прежнему = первый базовый вариант');
 assert.deepStrictEqual(stable.list0,stable.basic0,'listVoicingVariants[0] = generateKeysVoicings[0]');
 assert.deepStrictEqual(errors,[]);console.log('0.791 B-119: карточки вариантов, широкие на 61+, ручной выбор и старые индексы стабильны — OK');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});

/* Плавные обращения: явное включение, сохранение выбора и единые ноты. */
const assert=require('assert'),puppeteer=require('puppeteer');
(async()=>{const browser=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'/tmp/chromium',args:['--no-sandbox']});try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:390,height:844});
 await page.goto(process.env.STRUCHORD_URL||'http://127.0.0.1:8000/STRUCHORD.html');await page.evaluate(()=>localStorage.setItem('struchord-default-instrument','keys'));await page.reload();
 await page.evaluate(()=>{startNewSongFromHome();addSection('Verse');songStore.dispatch('test/chords',()=>{const ev=sections[0].squares[0].events;['E','G#m','C#m','B'].forEach((c,i)=>{ev[i].chord=c;});});});
 const before=await page.evaluate(()=>StruChordTracks.state());assert(!before.tracks[0].linkedVoicings,'старый режим по умолчанию');
 const test=await page.evaluate(()=>{const K=StruChordKeys,T=StruChordTracks,sec=sections[0],sq=sec.squares[0];T.setLinkedVoicings(1,true);const keys=sq.events.slice(0,4).map((e,i)=>T.cellKey(sec,sq,i)), sel=keys.map(k=>K.linkedSelection(1,k));return {keys,sel,range:T.keyRange(1), formulas:['E','G#m','C#m','B'].map(c=>StruChordFormula.chordFormula(c,'C'))};});
 assert(test.sel.every(x=>x && !x.manual),'автоматический выбор для каждого аккорда');
 test.sel.forEach((x,i)=>{assert(x.notes.every(n=>n>=test.range.low && n<=test.range.high));for(const n of x.notes.slice(1))assert(test.formulas[i].pitchClasses.includes(n%12),'только ступени аккорда');});
 const [first,second]=test.sel.map(x=>x.notes);assert.equal(second[0]%12,8,'бас G#');assert.deepStrictEqual(second.slice(1).map(n=>n%12).sort((a,b)=>a-b),[3,8,11]);
 assert(second.slice(1).every((n,i)=>Math.abs(n-first[i+1])<=4),'голоса идут рядом на E → G#m');
 // Повторное чтение произвольным порядком не меняет выбор.
 const reverse=await page.evaluate(keys=>keys.slice().reverse().map(k=>StruChordKeys.linkedSelection(1,k).notes),test.keys);assert.deepStrictEqual(reverse,test.sel.map(x=>x.notes).reverse());
 // Выбранный вручную индекс имеет приоритет и становится опорой следующему аккорду.
 await page.evaluate(()=>StruChordTracks.setVoicingForChord(1,'G#m',1));let manual=await page.evaluate(keys=>keys.map(k=>StruChordKeys.linkedSelection(1,k)),test.keys);assert.equal(manual[1].manual,true);assert.equal((await page.evaluate(()=>StruChordTracks.track(1))).voicings['v:G#m'],1);
 // Транспорт, экспорт и первая нота целой ячейки используют единое положение.
 const actual=await page.evaluate(async keys=>{const s=sections[0],sq=s.squares[0],ev=sq.events[1],T=StruChordTracks,A=StruChordAccomp,ctx=getAudioContext();await ctx.resume();T.setPattern(1,T.cellKey(s,sq,1),{type:'keys-block',subdivision:1,steps:['H']});let steps;A.setStepObserver(x=>steps=x.steps);StruChordAudio.scheduleEvent(ctx,s,sq,ev,1,ctx.currentTime+.1,1,120,'4/4');A.setStepObserver(null);StruChordAudio.stopAll();let exported=StruChordExport.buildParts({sections,globalKey,globalTimeSig})[0].pitchRolls[s.id];let start=partEventWindowUnits(s,sq,1).start;return {notes:steps[0].notes,selected:StruChordKeys.linkedSelection(1,keys[1]).notes,exported:exported.filter(n=>n.start===start).map(n=>n.pitch)};},test.keys);
 assert.deepStrictEqual(actual.notes,actual.selected);assert.deepStrictEqual(actual.exported,actual.notes);
 // Прослушивание редактора использует тот же выбор в выбранной ячейке.
 const preview=await page.evaluate(async keys=>{const T=StruChordTracks,s=sections[0],ctx=getAudioContext(),A=StruChordAccomp;await ctx.resume();let notes;A.setStepObserver(x=>{notes=x.steps[0].notes});let stop=StruChordAudio.previewPattern('G#m',ctx,1,'C',{type:'keys-block',subdivision:1,steps:['H']},{scope:'cell',span:1,bpm:120,ts:'4/4',sec:s,cell:keys[1],keyboardSize:null});A.setStepObserver(null);if(stop)stop();return {notes,selected:StruChordKeys.linkedSelection(1,keys[1]).notes};},test.keys);assert.deepStrictEqual(preview.notes,preview.selected);
 // Узкая и широкая клавиатура, расширенный и слэш-аккорд не создают чужих звуков.
 const ranges=await page.evaluate(()=>{const K=StruChordKeys,T=StruChordTracks;let result=[];for(const size of [25,37,49,61,88]){T.setTrackKeyboardSize(1,size);for(const chord of ['C13','Cm','C/E']){const range=T.keyRange(1), f=StruChordFormula.chordFormula(chord,'C'), list=K.inversionCandidates(chord,'C',range);result.push({range,pcs:f.pitchClasses,bass:f.bass?f.bass.pitchClass:f.rootPc,list});}}return result;});
 ranges.forEach(x=>{assert(x.list.length);x.list.forEach(v=>{assert.equal(v[0]%12,x.bass);v.forEach(n=>assert(n>=x.range.low && n<=x.range.high));v.slice(1).forEach(n=>assert(x.pcs.includes(n%12)));});});
 await page.evaluate(()=>StruChordTracks.setTrackKeyboardSize(1,null));
 // Сохранённые данные и восстановление истории.
 const save=await page.evaluate(()=>{let T=StruChordTracks,r={sections:JSON.parse(JSON.stringify(sections)),...T.exportForSave()};return T.attach(r,r);});assert.equal(save.tracks[0].linkedVoicings,true);assert.equal(save.tracks[0].voicings['v:G#m'],1);
 await new Promise(r=>setTimeout(r,550));await page.evaluate(()=>StruChordTracks.setLinkedVoicings(1,false));assert(!((await page.evaluate(()=>StruChordTracks.track(1))).linkedVoicings));await page.evaluate(()=>undoEdit());await new Promise(r=>setTimeout(r,120));assert.equal((await page.evaluate(()=>StruChordTracks.track(1))).linkedVoicings,true);
 // Бас по секции влияет на реальные шаги, но не переписывает обращения.
 const noBass=await page.evaluate(keys=>{const T=StruChordTracks,s=sections[0];T.setBassRole(1,s.id,'nobass');let selected=StruChordKeys.linkedSelection(1,keys[1]).notes;let steps=StruChordAccomp.plan({trackId:1,sec:s,chord:'G#m',key:'C',range:T.keyRange(1),notes:selected,span:1,dur:1,ts:'4/4',pattern:{type:'keys-block',subdivision:1,steps:['H']},patternSource:'cell',noHighlight:true});return {selected,played:steps[0].notes};},test.keys);assert.deepStrictEqual(noBass.played,noBass.selected.slice(1));
 // Изменение аккорда инвалидирует кэш; другая дорожка не меняется.
 const edit=await page.evaluate(keys=>{let old=StruChordKeys.linkedSelection(1,keys[2]).notes;songStore.dispatch('test/change',()=>{sections[0].squares[0].events[2].chord='Am';});return {old,entry:StruChordKeys.linkedSelection(1,keys[2])};},test.keys);assert.equal(edit.entry.chord,'Am');assert.notDeepStrictEqual(edit.old,edit.entry.notes);
 await page.evaluate(()=>StruChordKeys.open());assert.equal(await page.$eval('#b39LinkedVoicings',e=>e.checked),true);assert.match(await page.$eval('#b39KeysPanel',e=>e.textContent),/Плавные обращения/);
 await page.setViewport({width:320,height:640});await page.evaluate(()=>{StruChordKeys.close();StruChordKeys.open();});let mobile=await page.$eval('#b39KeysPanel',e=>({width:e.getBoundingClientRect().width,view:innerWidth}));assert(mobile.width<=mobile.view,'панель на узком экране');await page.setViewport({width:390,height:844});
 // План показывает переключатель и не меняет режим до применения.
 await page.evaluate(()=>StruChordKeys.close());await page.evaluate(()=>openStrumPatternEditor('section',sections[0].id));await page.click('#b39AutoOpen');assert.equal(await page.$eval('#b39AutoLinked',e=>e.checked),true);await page.click('#b39AutoLinked');assert.equal((await page.evaluate(()=>StruChordTracks.track(1))).linkedVoicings,true);await page.click('#b39AutoCancel');
 assert.equal((await page.evaluate(()=>StruChordTracks.track(1))).linkedVoicings,true);
 // За пределом 2048 событий используется одинаковый ограниченный выбор.
 const bounded=await page.evaluate(()=>{songStore.dispatch('test/long-section',()=>{let e=sections[0].squares[0].events;while(e.length<2050)e.push({chord:'C',span:1});});const s=sections[0],sq=s.squares[0],cell=StruChordTracks.cellKey(s,sq,2049);let a=StruChordKeys.linkedSelection(1,cell),b=StruChordKeys.linkedSelection(1,cell);return {a,b};});assert.equal(bounded.a.limited,true);assert.deepStrictEqual(bounded.a.notes,bounded.b.notes);

 assert.deepStrictEqual(errors,[]);console.log('B-39 обращения: голоса, ручной выбор, звук, экспорт, история и старый режим — OK');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});

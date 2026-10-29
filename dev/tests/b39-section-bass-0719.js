const assert=require('assert'), puppeteer=require('puppeteer');
(async()=>{const browser=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'/tmp/chromium',args:['--no-sandbox']});try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewport({width:390,height:844});await page.goto(process.env.STRUCHORD_URL||'http://127.0.0.1:8000/STRUCHORD.html');
 await page.evaluate(()=>localStorage.setItem('struchord-default-instrument','keys'));await page.reload();
 await page.evaluate(()=>{startNewSongFromHome();addSection('Intro');addSection('Chorus');});
 // Инициализируем аккорды без вмешательства в остальные дорожки.
 await page.evaluate(()=>{sections.forEach(s=>s.squares[0].events[0].chord='C/E');requestRender();});
 const ids=await page.evaluate(()=>sections.map(s=>s.id));const intro=ids[0],chorus=ids[1];
 let r=await page.evaluate(ids=>{let T=StruChordTracks,A=StruChordAccomp,s=sections[0],sq=s.squares[0],ev=sq.events[0],range=T.keyRange(1),notes=[40,60,64,67];
 const run=(role, token)=>{T.setBassRole(1,s.id,role);return A.plan({trackId:1,sec:s,sq,ev,ei:0,chord:'C/E',key:'C',range,notes,span:1,dur:1,ts:'4/4',pattern:{type:'keys-block',subdivision:1,steps:[token]},patternSource:'cell',noHighlight:true})[0].notes;};
 return {legacy:run('legacy','H'),off:run('nobass','H'),bass:run('nobass','B'),oct:run('nobass','O'),mix:run('nobass',['B','H']),auto:run('auto','H'),on:run('bass','H')};},ids);
 assert.deepStrictEqual(r.legacy,[40,60,64,67]);assert.deepStrictEqual(r.off,[60,64,67]);assert.deepStrictEqual(r.bass,[]);assert.deepStrictEqual(r.oct,[]);assert.deepStrictEqual(r.mix,r.off);assert.deepStrictEqual(r.auto,r.off);assert.deepStrictEqual(r.on,r.legacy);
 await page.evaluate(id=>{StruChordTracks.setBassRole(1,id,'legacy');openStrumPatternEditor('section',id);},intro);
 await page.click('#b39AutoOpen');assert.match(await page.$eval('#b39AutoPlan',e=>e.textContent),/Бас: авто \(без баса\)/);
 await page.select(`[data-bass-sec="${intro}"]`,'auto');await page.select(`[data-bass-sec="${chorus}"]`,'bass');await page.click('#b39AutoApply');
 let state=await page.evaluate(()=>StruChordTracks.state());assert.equal(state.tracks[0].bassRoles[intro],'auto');assert.equal(state.tracks[0].bassRoles[chorus],'bass');
 let saved=await page.evaluate(()=>{const T=StruChordTracks,raw={sections:JSON.parse(JSON.stringify(sections)),...T.exportForSave()};return T.attach(raw,raw);});assert.deepStrictEqual(saved.tracks[0].bassRoles,state.tracks[0].bassRoles);
 await page.evaluate(()=>undoEdit());await new Promise(r=>setTimeout(r,150));assert.equal((await page.evaluate(()=>StruChordTracks.state())).tracks[0].bassRoles,undefined);
 await page.evaluate(()=>redoEdit());await new Promise(r=>setTimeout(r,150));assert.deepStrictEqual((await page.evaluate(()=>StruChordTracks.state())).tracks[0].bassRoles,state.tracks[0].bassRoles);
 // Ручное решение независимо от рисунка и меняется одной командой.
 await page.evaluate(id=>openStrumPatternEditor('section',id),intro);await page.select('#b39BassMode','nobass');await page.click('#b39AccReset');await page.click('#b39AccSave');
 assert.equal(await page.evaluate(id=>StruChordTracks.bassRole(1,id),intro),'nobass');
 await page.evaluate(()=>undoEdit());await new Promise(r=>setTimeout(r,150));assert.equal(await page.evaluate(id=>StruChordTracks.bassRole(1,id),intro),'auto');
 await page.evaluate(()=>redoEdit());await new Promise(r=>setTimeout(r,150));
 // Ячеечный рисунок тоже подчиняется роли секции; экспорт планирует те же ноты.
 r=await page.evaluate(id=>{const T=StruChordTracks,A=StruChordAccomp,E=StruChordExport,s=sections.find(x=>x.id===id),sq=s.squares[0],ev=sq.events[0],cell=T.cellKey(s,sq,0),track=T.track(1),range=T.keyRange(1),notes=[40,60,64,67];T.setPattern(1,cell,{type:'keys-block',subdivision:1,steps:[['B','H']]});const x=A.plan({trackId:1,cell,sec:s,sq,ev,ei:0,chord:'C/E',key:'C',range,notes,span:1,dur:1,ts:'4/4',noSwing:true}),y=E.stepsFor(track,cell,s,sq,ev,0,'C/E','C',range,notes,1,'4/4');return [x[0].notes,y[0].notes];},intro);
 assert.deepStrictEqual(r,[[60,64,67],[60,64,67]]);
 // Проверяем реальные ноты транспорта и партии экспорта на одних данных.
 const observed=await page.evaluate(async id=>{const T=StruChordTracks,A=StruChordAccomp,s=sections.find(x=>x.id===id),sq=s.squares[0],ev=sq.events[0],ctx=getAudioContext();await ctx.resume();let played=null;A.setStepObserver(x=>{played=x.steps.flatMap(z=>z.notes);});StruChordAudio.scheduleEvent(ctx,s,sq,ev,0,ctx.currentTime+.05,1,120,'4/4');A.setStepObserver(null);StruChordAudio.stopAll();let part=StruChordExport.buildParts({sections,globalTimeSig,globalKey})[0];return {played,exported:(part.pitchRolls[id]||[]).map(n=>n.pitch),raw:StruChordKeys.generateKeysVoicings('C/E','C',T.keyRange(1),null,{})[0]};},intro);
 assert(observed.played.length>0);assert.deepStrictEqual([...new Set(observed.played)],observed.raw.slice(1));assert.deepStrictEqual([...new Set(observed.exported)].sort((a,b)=>a-b),[...new Set(observed.played)].sort((a,b)=>a-b),'экспорт совпадает с транспортом');
 const variants=await page.evaluate(id=>{let T=StruChordTracks,A=StruChordAccomp,s=sections.find(x=>x.id===id),range=T.keyRange(1);return ['C13','Cm','C/E'].map(ch=>{let notes=StruChordKeys.generateKeysVoicings(ch,'C',range,null,{})[0],plan=A.plan({trackId:1,sec:s,chord:ch,key:'C',range,notes,span:1,dur:1,ts:'4/4',pattern:{type:'keys-block',subdivision:1,steps:['H']},patternSource:'cell',noHighlight:true});return [notes,plan[0].notes];});},intro);
 variants.forEach(([before,after])=>assert.deepStrictEqual(after,before.slice(1)));
 await page.evaluate(id=>cloneSection(id),intro);const clone=await page.evaluate(id=>{let i=sections.findIndex(s=>s.id===id);return sections[i+1].id;},intro);
 assert.equal(await page.evaluate(id=>StruChordTracks.bassRole(1,id),clone),'nobass');
 await page.evaluate(id=>removeSection(id),clone);assert.equal((await page.evaluate(()=>StruChordTracks.state())).tracks[0].bassRoles[clone],undefined);
 await page.evaluate(()=>undoEdit());await new Promise(r=>setTimeout(r,150));assert.equal(await page.evaluate(id=>StruChordTracks.bassRole(1,id),clone),'nobass');
 assert.deepStrictEqual(errors,[]);console.log('B-39 бас секции: политика, план, история, сохранение, экспорт, клон — OK');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});

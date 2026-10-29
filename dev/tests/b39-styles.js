/* B-39: жанровые рисунки клавиш — сетка, звук, сохранение и интерфейс. */
const assert=require('assert'), puppeteer=require('puppeteer');
(async()=>{const browser=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'/tmp/chromium',args:['--no-sandbox']});try{
 const page=await browser.newPage(), errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:390,height:844});
 await page.goto(process.env.STRUCHORD_URL||'http://127.0.0.1:8000/STRUCHORD.html');await page.evaluate(()=>localStorage.setItem('struchord-default-instrument','keys'));await page.reload();
 await page.evaluate(()=>{startNewSongFromHome();addSection('A');sections[0].squares[0].events[0].chord='C';requestRender();});
 const data=await page.evaluate(()=>{let A=StruChordAccomp;return A.styles().map(s=>({style:s,patterns:[0,1,2].map(i=>{const p=A.preset('style-'+s.id+'-'+i);let configs=['4/4','3/4','6/8'].map(ts=>{const beats=parseInt(ts);const steps=A.buildSteps(p.id,2,beats);const plan=A.plan({pattern:{type:p.id,subdivision:2,swing:p.presetSwing},patternSource:'section',span:beats,dur:beats,ts,chord:'C',key:'C',notes:[48,60,64,67],range:{low:36,high:84}});return {steps,notes:plan.map(x=>x.notes),swing:plan[0].swing};});return {id:p.id,configs};})}));});
 assert.equal(data.length,9);for(const s of data){assert.equal(new Set(s.patterns.map(p=>JSON.stringify(p.configs[0].steps))).size,3,`${s.style.label}: три разных рисунка`); for(const p of s.patterns){for(let i=0;i<3;i++){const c=p.configs[i], expected=[8,6,12][i];assert.equal(c.steps.length,expected);assert.equal(c.notes.length,expected);assert(c.notes.some(n=>n.length),'рисунок звучит');assert(c.notes.flat().every(n=>n>=36&&n<=84),'ноты в диапазоне');}}}
 await page.evaluate(()=>openStrumPatternEditor('section',sections[0].id));
 assert.equal(await page.$eval('#b39AccGenre',e=>e.value),'');
 await page.select('#b39AccGenre','blues');
 let visible=await page.$$eval('#b39AccPanel .b39-acc-preset',es=>es.filter(e=>!e.hidden).map(e=>e.dataset.preset));assert.deepStrictEqual(visible,['style-blues-0','style-blues-1','style-blues-2']);
 await page.click('[data-preset="style-blues-0"]');assert.equal(await page.$eval('#b39AccSwing',e=>e.getAttribute('aria-pressed')),'true');
 await page.click('#b39AccSave');const saved=await page.evaluate(()=>Object.values(StruChordTracks.state().tracks[0].patterns)[0]);assert.equal(saved.type,'style-blues-0');assert.equal(saved.swing,true);
 const restored=await page.evaluate(()=>{const T=StruChordTracks,raw={sections:JSON.parse(JSON.stringify(sections)),...T.exportForSave()};return T.attach(raw,raw).tracks[0].patterns;});assert.equal(Object.values(restored)[0].type,'style-blues-0');
 await page.evaluate(()=>openStrumPatternEditor('section',sections[0].id));assert.equal(await page.$eval('#b39AccGenre',e=>e.value),'blues');assert.equal(await page.$eval('[data-preset="style-blues-0"]',e=>e.getAttribute('aria-pressed')),'true');await page.click('#b39AccCancel');assert.deepStrictEqual(errors,[]);
 console.log('B-39: 27 жанровых рисунков, размер, звук, сохранение — OK');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});

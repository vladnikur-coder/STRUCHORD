/* B-39: создание клавишного рисунка, длина, предупреждения и сохранение. */
const assert = require('assert');
const puppeteer = require('puppeteer');
(async()=>{
 const browser=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'/tmp/chromium',args:['--no-sandbox']});
 try {
  const page=await browser.newPage(), errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.setViewport({width:390,height:844});
  await page.goto(process.env.STRUCHORD_URL||'http://127.0.0.1:8000/STRUCHORD.html');
  await page.evaluate(()=>localStorage.setItem('struchord-default-instrument','keys')); await page.reload();
  await page.evaluate(()=>{startNewSongFromHome();addSection('A');sections[0].squares[0].events[0].chord='C';requestRender();});
  await page.waitForSelector('.chord-btn-strum');
  const open=(scope='section')=>page.evaluate(scope=>openStrumPatternEditor(scope,sections[0].id,sections[0].squares[0].id,0),scope);
  const choose=token=>page.click(`#b39AccStepChoice [data-token="${token}"]`);
  const step=i=>page.click(`#b39AccSteps [data-step="${i}"]`);
  const snapshot=()=>page.evaluate(()=>StruChordTracks.state().tracks[0].patterns);
  await open();
  // Сначала создаём короткий повторяющийся рисунок и выбираем сочетание.
  page.once('dialog',d=>d.accept()); await page.click('#b39AccLength [data-length="2"]');
  await step(0); await choose('H'); await choose('B'); await choose('t3');
  assert.equal(await page.$eval('#b39AccStepChoice [data-token="B"]',e=>e.getAttribute('aria-pressed')),'true');
  assert.equal(await page.$eval('#b39AccStepChoice [data-token="t3"]',e=>e.getAttribute('aria-pressed')),'true');
  assert.deepStrictEqual(await snapshot(),{},'черновик не сохраняется автоматически');
  await page.click('#b39AccSave');
  let p=Object.values(await snapshot())[0]; assert.equal(p.steps.length,2); assert.deepStrictEqual(p.steps[0],['B','t3']);
  const resolved=await page.evaluate(p=>{let C={pattern:p,patternSource:'section',span:4,dur:4,ts:'4/4',key:'C',range:{low:36,high:84},notes:[48,60,64,67]};return ['C','Cm','C7'].map(chord=>StruChordAccomp.plan({...C,chord}).map(x=>({token:x.token,notes:x.notes})));},p);
  assert.deepStrictEqual(resolved[0][0].token,['B','t3']); assert.deepStrictEqual(resolved[0][2].token,['B','t3'],'короткий рисунок повторяется');
  assert(resolved[0][0].notes.includes(64),'терция мажорного аккорда'); assert(resolved[1][0].notes.some(n=>n%12===3),'терция минорного аккорда');
  // Сохранение файла и повторное открытие не теряют длину и комбинации.
  const restored=await page.evaluate(()=>{const T=StruChordTracks;const raw={sections:JSON.parse(JSON.stringify(sections)),...T.exportForSave()};return T.attach(raw,raw).tracks[0].patterns;});
  assert.deepStrictEqual(restored,await snapshot());
  await open(); assert.equal(await page.$eval('#b39AccLength [data-length="2"]',e=>e.getAttribute('aria-pressed')),'true');
  await step(0); assert.equal(await page.$eval('#b39AccStepChoice [data-token="B"]',e=>e.getAttribute('aria-pressed')),'true');
  await choose('t5'); await page.click('#b39AccCancel'); assert.deepStrictEqual(await snapshot(),restored,'отмена возвращает сохранённый рисунок');
  // Шаги, которые не умещаются после смены дробности, не пропадают без согласия.
  await open(); await page.click('#b39AccPanel [data-sub="2"]'); await step(1); await choose('t5');
  page.once('dialog',d=>d.dismiss()); await page.click('#b39AccPanel [data-sub="1"]');
  assert.equal(await page.$eval('#b39AccPanel [data-sub="2"]',e=>e.getAttribute('aria-pressed')),'true');
  assert.equal(await page.$eval('#b39AccStepChoice [data-token="t5"]',e=>e.getAttribute('aria-pressed')),'true','шаг сохранён при отказе');
  page.once('dialog',d=>d.accept()); await page.click('#b39AccPanel [data-sub="1"]');
  assert.equal(await page.$eval('#b39AccPanel [data-sub="1"]',e=>e.getAttribute('aria-pressed')),'true');
  await page.click('#b39AccCancel'); assert.deepStrictEqual(await snapshot(),restored);
  // Сокращение длины тоже защищено; удлинение повторяет ранее созданное.
  await open(); await page.click('#b39AccLength [data-length="4"]');
  assert.equal(await page.$$('#b39AccSteps button').then(a=>a.length),4);
  page.once('dialog',d=>d.dismiss()); await page.click('#b39AccLength [data-length="2"]');
  assert.equal(await page.$eval('#b39AccLength [data-length="4"]',e=>e.getAttribute('aria-pressed')),'true');
  await page.click('#b39AccSave'); p=Object.values(await snapshot())[0]; assert.equal(p.steps.length,4); assert.deepStrictEqual(p.steps[0],p.steps[2]);
  await open(); await step(0);
  const layout=await page.$eval('#b39AccPanel',e=>({height:e.clientHeight,scroll:e.scrollHeight,view:innerHeight,width:e.getBoundingClientRect().width,screen:innerWidth}));
  assert(layout.height<=layout.view && layout.scroll>layout.height && layout.width<=layout.screen,'окно доступно с прокруткой на телефоне');
  await page.click('#b39AccSave');
  await open('event'); assert(await page.$eval('#b39AccPanel',e=>!e.hidden),'унаследованная ячейка открывается');
  await step(0); await choose('t7'); await page.click('#b39AccSave');
  const patterns=await snapshot(); assert(Object.keys(patterns).length===2,'отдельная ячейка не затрагивает рисунок секции');
  await open('event'); await page.click('#b39AccReset'); await page.click('#b39AccSave');
  assert.equal(Object.keys(await snapshot()).length,1,'сброс возвращает наследование');
  // Два такта доступны, когда квадрат достаточно длинный; второй такт
  // продолжает рисунок, а не запускает его сначала.
  await page.evaluate(()=>{sections[0].squares[0].events[0].span=8;});
  await open(); await page.click('#b39AccLength [data-length="8"]');
  await step(4); await choose('t1'); await page.click('#b39AccSave');
  p=Object.values(await snapshot())[0]; assert.equal(p.steps.length,8);
  const across=await page.evaluate(p=>{const sq={events:[{span:4},{span:4}]}; return StruChordAccomp.plan({pattern:p,patternSource:'section',sq,ei:1,ev:sq.events[1],span:4,dur:4,ts:'4/4',chord:'C',key:'C',notes:[48,60,64,67],range:{low:36,high:84}})[0].token;},p);
  assert.deepStrictEqual(across,p.steps[4],'фаза продолжается со второго такта');
  await page.setViewport({width:320,height:640});
  await open(); assert.equal(await page.$eval('#b39AccLength [data-length="8"]',e=>e.getAttribute('aria-pressed')),'true');
  assert.equal(await page.$eval('#b39AccSteps',e=>e.classList.contains('pattern-grid--rows')),true);
  const dimensions=await page.$eval('#b39AccPanel',e=>({scroll:e.scrollWidth,client:e.clientWidth,left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right,view:innerWidth}));
  assert(dimensions.scroll<=dimensions.client && dimensions.left>=0 && dimensions.right<=dimensions.view,'длинная сетка не расширяет окно на узком экране');
  await step(4); await choose('t3'); await page.click('#b39AccCancel');
  assert.deepStrictEqual(errors,[]); console.log('B-39: выбор звуков, длина, защита шагов и наследование — OK');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});

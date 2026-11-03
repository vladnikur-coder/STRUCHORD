/* B-39: общие элементы, Swing и его аудиотайминг. */
const assert = require('assert');
const puppeteer = require('puppeteer');
(async()=>{
 const browser=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'/tmp/chromium',args:['--no-sandbox']});
 try {
  const page=await browser.newPage(), errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.setViewport({width:390,height:844});
  await page.goto(process.env.STRUCHORD_URL||'http://127.0.0.1:8000/STRUCHORD.html',{waitUntil:'load'});
  await page.evaluate(()=>localStorage.setItem('struchord-default-instrument','keys')); await page.reload({waitUntil:'load'});
  await page.evaluate(()=>{startNewSongFromHome();addSection('A');sections[0].squares[0].events[0].chord='C';requestRender();});
  await page.waitForSelector('.chord-btn-strum');
  const open=()=>page.evaluate(()=>openStrumPatternEditor('section',sections[0].id));
  const sub=n=>page.click(`#b39AccPanel .pattern-sub-btn[data-sub="${n}"]`);
  await open();
  assert.equal(await page.$('#b39AccPanel [aria-label="Размер клавиатуры дорожки"]'),null);
  assert.equal(await page.$eval('#b39AccSwing',e=>getComputedStyle(e).display),'none','Swing скрыт на 1');
  assert.equal(await page.$eval('#b39AccPanel [data-sub="3"]',e=>getComputedStyle(e).display),'none','триоли скрыты в 4/4');
  assert(await page.$('#b39AccPanel .pattern-presets .pattern-preset-chip .pattern-preset-name'));
  assert(await page.$('#b39AccPanel .pattern-grid .pattern-beat-group .pattern-beat-numbers'));
  const css=await page.$eval('#b39AccPanel .pattern-preset-chips',e=>({display:getComputedStyle(e).display,wrap:getComputedStyle(e).flexWrap}));
  assert.deepStrictEqual(css,{display:'flex',wrap:'nowrap'},'пресеты используют гитарную горизонтальную ленту');
  await sub(2); assert(await page.$eval('#b39AccSwing',e=>getComputedStyle(e).display!=='none'));
  assert.equal(await page.$eval('#b39AccSwing',e=>e.getAttribute('aria-pressed')),'false');
  await page.click('#b39AccPreview'); const before=await page.evaluate(()=>StruChordAudio.stats().notes);
  await page.click('#b39AccSwing'); assert((await page.evaluate(()=>StruChordAudio.stats().notes))>before,'Swing перезапускает прослушивание');
  await sub(1); assert.equal(await page.$eval('#b39AccSwing',e=>getComputedStyle(e).display),'none');
  await sub(4); assert.equal(await page.$eval('#b39AccSwing',e=>e.getAttribute('aria-pressed')),'true','Swing сохраняется при переключении дробности');
  await sub(2); await page.click('#b39AccSave');
  const saved=await page.evaluate(()=>Object.values(StruChordTracks.state().tracks[0].patterns)[0]);
  assert.equal(saved.swing,true); assert.equal(saved.subdivision,2);
  const timing=await page.evaluate(()=>{const pattern=Object.values(StruChordTracks.state().tracks[0].patterns)[0];let args={pattern,patternSource:'section',ts:'4/4',span:4,dur:4,notes:[60,64,67],chord:'C',key:'C'}; return [StruChordAccomp.plan(args),StruChordAccomp.plan({...args,noSwing:true})].map(a=>a.map(x=>x.at));});
  assert(Math.abs(timing[0][1]-2/3)<1e-6 && Math.abs(timing[1][1]-0.5)<1e-6,'Swing меняет аудиотайминг с 1/2 на 2/3');
  await open(); assert.equal(await page.$eval('#b39AccSwing',e=>e.getAttribute('aria-pressed')),'true','Swing сохранён после открытия');
  await page.click('#b39AccSwing'); await page.click('#b39AccCancel');
  assert.equal(await page.evaluate(()=>Object.values(StruChordTracks.state().tracks[0].patterns)[0].swing),true,'отмена не меняет Swing');
  await page.evaluate(()=>{sections[0].timeSig='6/8'}); await open();
  assert(await page.$eval('#b39AccPanel [data-sub="3"]',e=>getComputedStyle(e).display!=='none'));
  await sub(3); assert.equal(await page.$eval('#b39AccSwing',e=>getComputedStyle(e).display),'none');
  await sub(2); assert.equal(await page.$eval('#b39AccSwing',e=>e.getAttribute('aria-pressed')),'true','Swing вернулся после триолей');
  const layout=await page.$eval('#b39AccPanel',e=>{let r=e.getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth,scroll:e.scrollWidth,client:e.clientWidth}});
  assert(layout.left>=0 && layout.right<=layout.width && layout.scroll<=layout.client,'панель помещается на мобильном экране');
  await page.click('#b39AccCancel'); assert.deepStrictEqual(errors,[],'ошибок JS нет');
  console.log('B-39: дизайн, Swing, звук и мобильный экран — OK');
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1)});

/* Закреплённая клавиатура следует за плеером при прокрутке. */
const assert=require('assert'),puppeteer=require('puppeteer');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const browser=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'/tmp/chromium',args:['--no-sandbox']});try{
 for(const [width,height,scale] of [[1440,900,125],[390,844,125],[320,640,125],[844,390,125],[390,844,150]]){
  const page=await browser.newPage(), errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width,height});
  await page.evaluateOnNewDocument(s=>{localStorage.setItem('struchord-default-instrument','keys');localStorage.setItem('struchord-ui-scale',String(s));},scale);
  await page.goto(process.env.STRUCHORD_URL||'http://127.0.0.1:8000/STRUCHORD.html',{waitUntil:'load'});
  await page.evaluate(()=>{startNewSongFromHome();for(let i=0;i<16;i++){addSection('Verse');sections[sections.length-1].squares[0].events[0].chord='C';}StruChordKeys.open();}); await wait(250);
  const before=await page.evaluate(()=>JSON.stringify(StruChordTracks.exportForSave()));
  const measure=()=>page.evaluate(()=>{const p=document.querySelector('#b39KeysPanel'),b=document.querySelector('.transport-bar'),kb=p.querySelector('.b39-keys-body').getBoundingClientRect(),r=p.getBoundingClientRect(),bar=b.getBoundingClientRect();return {y:scrollY,top:r.top,bottom:r.bottom,height:r.height,barTop:bar.top,barBottom:bar.bottom,kbTop:kb.top,kbBottom:kb.bottom,client:p.clientHeight,scroll:p.scrollHeight,viewport:innerHeight,pageWidth:document.documentElement.scrollWidth,viewWidth:innerWidth,style:getComputedStyle(p).position};});
  await page.evaluate(()=>window.scrollTo(0,1300));await wait(150);const first=await measure();
  await page.evaluate(()=>window.scrollTo(0,2100));await wait(150);const second=await measure();
  assert(first.y>=1200 && second.y>first.y,`песня прокручивается ${width}x${height}`);
  assert.equal(second.style,'sticky');assert(Math.abs(first.top-second.top)<2,`клавиатура закреплена ${width}x${height}`);
  assert(Math.abs(first.barTop-second.barTop)<2,`плеер закреплён ${width}x${height}`);
  assert(second.top>=second.barBottom-1,`клавиатура под плеером ${width}x${height}`);
  assert(second.bottom<=height-20,`остаётся видимая часть песни ${width}x${height}`);
  assert(second.kbTop>=second.top && second.kbTop<second.bottom-30,`клавиши видны ${width}x${height}`);
  assert(second.pageWidth<=second.viewWidth+1,`страница не прокручивается горизонтально ${width}x${height}`);
  // Элементы, не поместившиеся по высоте, доступны внутренней прокруткой.
  await page.evaluate(()=>{const panel=document.querySelector('#b39KeysPanel');panel.scrollTop=panel.scrollHeight;});
  const ctrl=await page.$eval('#b39KeysTrackSize',e=>{const p=document.querySelector('#b39KeysPanel'),r=e.getBoundingClientRect(),pr=p.getBoundingClientRect();return {top:r.top,bottom:r.bottom,ptop:pr.top,pbottom:pr.bottom}});
  assert(ctrl.bottom<=ctrl.pbottom+1 && ctrl.top>=ctrl.ptop-1,`управление доступно в панели ${width}x${height}`);
  await page.select('#b39KeysTrackSize','49'); assert.equal((await page.evaluate(()=>StruChordTracks.track(1))).keyboardSize,49);
  // Высота плеера на мобильном меняется после «Ещё», отступ панели должен обновиться.
  if(width<=640){await page.evaluate(()=>document.querySelector('#btnTransportMore').click());await wait(250);const expanded=await measure();assert(expanded.top>=expanded.barBottom-1,`развёрнутый плеер не перекрывает панель ${width}`);}
  // Записанные данные не меняются от самой прокрутки / открытия панели.
  await page.evaluate(()=>StruChordTracks.setTrackKeyboardSize(1,null));assert.equal(await page.evaluate(()=>JSON.stringify(StruChordTracks.exportForSave())),before);
  assert.deepStrictEqual(errors,[]);await page.close();
 }
 // Закреплённая аппликатура находится между плеером и клавиатурой, даже при прокрутке.
 const page=await browser.newPage();await page.setViewport({width:1440,height:900});await page.evaluateOnNewDocument(()=>localStorage.setItem('struchord-default-instrument','keys'));await page.goto(process.env.STRUCHORD_URL||'http://127.0.0.1:8000/STRUCHORD.html');
 await page.evaluate(()=>{startNewSongFromHome();for(let i=0;i<15;i++){addSection('Verse');sections[sections.length-1].squares[0].events[0].chord='C';}StruChordKeys.open();const s=sections[0],q=s.squares[0];pinnedFingering={secId:s.id,squareId:q.id,eventIndex:0,chord:'C'};renderPinnedFingering();});await wait(250);
 await page.evaluate(()=>window.scrollTo(0,1200));await wait(200);
 let m=await page.evaluate(()=>({p:document.querySelector('#b39KeysPanel').getBoundingClientRect().top,row:document.querySelector('#pinnedRow').getBoundingClientRect().bottom}));assert(m.p>=m.row-1,'аппликатура не перекрывает панель');
 await page.evaluate(()=>unpinFingering());await wait(250);m=await page.evaluate(()=>({p:document.querySelector('#b39KeysPanel').getBoundingClientRect().top,bar:document.querySelector('.transport-bar').getBoundingClientRect().bottom}));assert(m.p>=m.bar-1 && m.p-m.bar<20,'после открепления промежуток освобождается');
 await page.evaluate(()=>{const panel=document.querySelector('#b39KeysPanel');panel.scrollTop=0;});await page.click('.b39-keys-close');assert(await page.$eval('#b39KeysPanel',e=>e.hidden),'закрытие работает при прокрутке');
 await page.close();console.log('B-39: закрепление, высота плеера, экраны, масштаб, управление и закреплённая аппликатура — OK');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});

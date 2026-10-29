/* Десктоп: видимая высота клавиш, при необходимости — небольшое превышение четверти. */
const assert=require('assert'),puppeteer=require('puppeteer');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const browser=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'/tmp/chromium',args:['--no-sandbox']});try{
 for(const [w,h,scale] of [[1920,1080,100],[1440,900,125],[1366,768,125],[1280,720,125],[1280,720,150]]){
  const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:w,height:h});
  await p.evaluateOnNewDocument(s=>{localStorage.setItem('struchord-default-instrument','keys');localStorage.setItem('struchord-ui-scale',String(s));},scale);
  await p.goto(process.env.STRUCHORD_URL||'http://127.0.0.1:8000/STRUCHORD.html');
  await p.evaluate(()=>{startNewSongFromHome();for(let i=0;i<15;i++){addSection('Verse');sections.at(-1).squares[0].events[0].chord='C';}StruChordKeys.open();});await wait(250);await p.evaluate(()=>scrollTo(0,1200));await wait(150);
  const before=await p.evaluate(()=>JSON.stringify(StruChordTracks.exportForSave()));
  const get=()=>p.evaluate(()=>{let panel=document.querySelector('#b39KeysPanel'),svg=panel.querySelector('svg'),body=panel.querySelector('.b39-keys-body'),bar=document.querySelector('.transport-bar');return {rect:panel.getBoundingClientRect().toJSON(),key:svg.querySelector('rect').getBoundingClientRect().toJSON(),svg:svg.getBoundingClientRect().toJSON(),bar:bar.getBoundingClientRect().toJSON(),scrollWidth:body.scrollWidth,clientWidth:body.clientWidth,overflow:getComputedStyle(panel).overflowY};});
  let d=await get();const label=`${w}x${h} ${scale}%`;
  assert(d.key.height>=72*scale/100-.5,`${label}: слишком короткие клавиши ${d.key.height}`);assert(d.rect.top>=d.bar.bottom-1 && d.svg.bottom<=d.rect.bottom-1,`${label}: закрепление и видимость`);assert.equal(d.overflow,'visible');
  if(d.rect.bottom>h/4+1)assert(d.key.height<=72*scale/100+1,`${label}: четверть превышена не из-за минимума клавиш`);
  assert.equal(await p.evaluate(()=>JSON.stringify(StruChordTracks.exportForSave())),before,`${label}: данные не изменились`);
  await p.click('#b39KeysSettingsToggle');await p.select('#b39KeysTrackSize','88');await p.click('#b39KeysSettingsToggle');d=await get();assert(d.key.height>=72*scale/100-.5);assert(d.scrollWidth>d.clientWidth,`${label}: длинная клавиатура прокручивается горизонтально`);
  const scroll=await p.evaluate(()=>{let e=document.querySelector('.b39-keys-body');e.scrollLeft=0;e.scrollLeft=e.scrollWidth;return e.scrollLeft;});assert(scroll>0);
  await p.evaluate(()=>{document.getElementById('showFingers').checked=true;toggleFingersVisibility();});await wait(80);d=await get();assert(d.svg.bottom<=d.rect.bottom-1,`${label}: пальцы видны`);assert.match(await p.$eval('.b39-keys-foot',e=>e.textContent),/цифры условны/);
  assert.deepStrictEqual(errors,[]);await p.close();
 }
 const p=await browser.newPage();await p.setViewport({width:1440,height:1400});await p.evaluateOnNewDocument(()=>{localStorage.setItem('struchord-default-instrument','keys');localStorage.setItem('struchord-ui-scale','150');});await p.goto(process.env.STRUCHORD_URL||'http://127.0.0.1:8000/STRUCHORD.html');
 await p.evaluate(()=>{startNewSongFromHome();for(let i=0;i<15;i++){addSection('Verse');sections.at(-1).squares[0].events[0].chord='C';}StruChordKeys.open();});await wait(200);let initial=await p.$eval('#b39KeysPanel svg rect',e=>e.getBoundingClientRect().height);await p.setViewport({width:1280,height:720});await wait(200);let smaller=await p.$eval('#b39KeysPanel svg rect',e=>e.getBoundingClientRect().height);assert(initial>smaller && smaller>=107.5,'перерасчёт при изменении размера с защитой минимальной высоты');await p.close();
 console.log('B-39: более высокие клавиши, размеры, пальцы, прокрутка и изменение окна — OK');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});

/* Десктоп: короткие клавиатуры и их панель центрированы; длинные прокручиваются. */
const assert=require('assert'),puppeteer=require('puppeteer');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const browser=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'/tmp/chromium',args:['--no-sandbox']});try{
 for(const [w,h,scale] of [[1920,1080,100],[1440,900,125],[1366,768,125],[1280,720,150]]){
  const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:w,height:h});
  await p.evaluateOnNewDocument(s=>{localStorage.setItem('struchord-default-instrument','keys');localStorage.setItem('struchord-ui-scale',String(s));},scale);
  await p.goto(process.env.STRUCHORD_URL||'http://127.0.0.1:8000/STRUCHORD.html');
  await p.evaluate(()=>{startNewSongFromHome();for(let i=0;i<15;i++){addSection('Verse');sections.at(-1).squares[0].events[0].chord='F';}StruChordTracks.setTrackKeyboardSize(1,25);});await wait(250);await p.evaluate(()=>scrollTo(0,1200));await wait(150);
  const before=await p.evaluate(()=>JSON.stringify(StruChordTracks.exportForSave()));const barBefore=await p.$eval('.transport-bar',e=>e.getBoundingClientRect().toJSON());await p.click('#b39KeysBtn');await wait(100);
  const measure=()=>p.evaluate(()=>{const panel=document.querySelector('#b39KeysPanel'),body=panel.querySelector('.b39-keys-body'),svg=body.querySelector('svg'),s=panel.querySelector('#b39KeysSettings'),b=document.querySelector('.transport-bar');return {p:panel.getBoundingClientRect().toJSON(),body:body.getBoundingClientRect().toJSON(),svg:svg.getBoundingClientRect().toJSON(),bar:b.getBoundingClientRect().toJSON(),settings:s.getBoundingClientRect().toJSON(),sw:body.scrollWidth,cw:body.clientWidth,scroll:body.scrollLeft,page:document.documentElement.scrollWidth,buttonRects:[...panel.querySelectorAll('.b39-keys-head button')].map(e=>e.getBoundingClientRect().toJSON()),overflow:getComputedStyle(panel).overflowY};});
  const center=d=>Math.abs((d.p.left+d.p.right)/2-(d.bar.left+d.bar.right)/2)<1;
  let d=await measure(),label=`${w}x${h} ${scale}%`;
  assert(center(d),`${label}: панель по центру плеера`);assert(d.p.width<d.bar.width-50,`${label}: панель 25 короче плеера`);assert(Math.abs((d.svg.left+d.svg.right)/2-(d.p.left+d.p.right)/2)<1,`${label}: клавиши по центру`);assert(d.svg.width<=d.body.width+1 && d.p.top>=d.bar.bottom-1,`${label}: короткая клавиатура видна целиком`);assert.equal(d.page<=w+1,true);assert.equal(d.overflow,'visible');assert(Math.abs(d.bar.height-barBefore.height)<1,'плеер не меняется');assert.equal(await p.evaluate(()=>JSON.stringify(StruChordTracks.exportForSave())),before,'открытие не меняет песню');
  assert(d.buttonRects.every(r=>r.left>=d.p.left && r.right<=d.p.right && r.top>=d.p.top && r.bottom<=d.p.bottom),'кнопки видны');const width25=d.p.width;
  await p.evaluate(()=>{document.getElementById('showFingers').checked=true;toggleFingersVisibility();});await wait(100);
  const warning=await p.$eval('.b39-keys-head .b39-keys-foot',e=>({text:e.textContent,sw:e.scrollWidth,cw:e.clientWidth}));assert.match(warning.text,/цифры условны/);assert(warning.sw<=warning.cw+1,`${label}: предупреждение не обрезано`);d=await measure();assert(center(d) && Math.abs((d.svg.left+d.svg.right)/2-(d.p.left+d.p.right)/2)<1,'центрирование при включённых пальцах');
  await p.evaluate(()=>{document.getElementById('showFingers').checked=false;toggleFingersVisibility();});await wait(100);
  await p.click('#b39KeysSettingsToggle');await wait(100);d=await measure();assert(center(d)&&Math.abs(d.p.width-width25)<2,`${label}: настройки не расширяют короткую панель`);assert(d.settings.bottom<=d.p.bottom+1,`${label}: настройки видны без вертикального скролла`);
  const controls=await p.evaluate(()=>[...document.querySelectorAll('#b39KeysSettings select')].map(e=>({width:e.clientWidth,scroll:e.scrollWidth,rect:e.getBoundingClientRect().toJSON()})));assert(controls.every(e=>e.width>100*scale/100 && e.rect.bottom<=d.p.bottom+1),`${label}: списки не сжаты`);
  await p.select('#b39KeysTrackSize','37');await wait(80);let s37=await measure();assert(center(s37) && s37.p.width>width25 && s37.p.width<=s37.bar.width+1,`${label}: панель 37 подстроилась`);
  await p.select('#b39KeysTrackSize','88');await wait(80);await p.click('#b39KeysSettingsToggle');d=await measure();assert(center(d)&&d.sw>d.cw,`${label}: длинная клавиатура прокручивается`);const sc=await p.evaluate(()=>{let e=document.querySelector('.b39-keys-body');e.scrollLeft=e.scrollWidth;return e.scrollLeft;});assert(sc>0,'горизонтальная прокрутка работает');assert.equal((await p.evaluate(()=>StruChordTracks.track(1))).keyboardSize,88);
  await p.evaluate(()=>scrollTo(0,1800));await wait(100);const sticky=await measure();assert(Math.abs(sticky.p.top-d.p.top)<2,'панель закреплена при прокрутке');assert.deepStrictEqual(errors,[]);await p.close();
 }
 console.log('B-39: центрирование, размеры 25/37/88, настройки, плеер и закрепление — OK');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});

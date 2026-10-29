/* Открытие клавиатуры и её настроек не меняет вид и размеры плеера. */
const assert=require('assert'),puppeteer=require('puppeteer');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'/tmp/chromium',args:['--no-sandbox']});try{
 for(const [width,height,scale] of [[1920,1080,100],[1440,900,125],[1366,768,125],[1280,720,150]]){
  const p=await b.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width,height});
  await p.evaluateOnNewDocument(s=>{localStorage.setItem('struchord-default-instrument','keys');localStorage.setItem('struchord-ui-scale',String(s));},scale);
  await p.goto(process.env.STRUCHORD_URL||'http://127.0.0.1:8000/STRUCHORD.html');await p.evaluate(()=>{startNewSongFromHome();for(let i=0;i<15;i++){addSection('Verse');sections.at(-1).squares[0].events[0].chord='C';}});await wait(220);await p.evaluate(()=>scrollTo(0,1200));await wait(130);
  const song=await p.evaluate(()=>JSON.stringify(StruChordTracks.exportForSave()));
  const snap=()=>p.evaluate(()=>{let bar=document.querySelector('.transport-bar'),s=getComputedStyle(bar),r=bar.getBoundingClientRect(),controls=['#btnPlay','#btnLoop','#btnCountIn','#b39KeysBtn'].map(id=>{let e=document.querySelector(id),r=e.getBoundingClientRect();return [id,r.width,r.height]});return {height:r.height,width:r.width,paddingTop:s.paddingTop,paddingBottom:s.paddingBottom,gap:s.gap,controls};});
  const orig=await snap();await p.click('#b39KeysBtn');await wait(150);assert.deepStrictEqual(await snap(),orig,`${width}/${scale}: открытие не меняет плеер`);
  let key=await p.$eval('#b39KeysPanel svg rect',e=>e.getBoundingClientRect().height);assert(key>=72*scale/100-.5,'клавиши остаются высокими');
  await p.click('#b39KeysSettingsToggle');await wait(80);assert.deepStrictEqual(await snap(),orig,'настройки не меняют плеер');
  await p.click('#b39KeysSettingsToggle');await p.click('.b39-keys-close');await wait(100);assert.deepStrictEqual(await snap(),orig,'закрытие сохраняет плеер');
  assert.equal(await p.evaluate(()=>JSON.stringify(StruChordTracks.exportForSave())),song,'открытие и закрытие не меняют данные песни');assert.deepStrictEqual(errors,[]);await p.close();
 }
 console.log('B-39: плеер не меняется при открытии, настройках и закрытии клавиатуры — OK');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});

/* Больше высота, та же ширина и прежний плеер; только компьютерные экраны. */
const assert=require('assert'),puppeteer=require('puppeteer');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const browser=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'/tmp/chromium',args:['--no-sandbox']});try{
 for(const [width,height,scale] of [[1920,1080,100],[1440,900,125],[1366,768,125],[1280,720,150]]){
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width,height});
  await page.evaluateOnNewDocument(s=>{localStorage.setItem('struchord-default-instrument','keys');localStorage.setItem('struchord-ui-scale',String(s));},scale);
  await page.goto(process.env.STRUCHORD_URL||'http://127.0.0.1:8000/STRUCHORD.html');await page.evaluate(()=>{startNewSongFromHome();for(let i=0;i<15;i++){addSection('Verse');sections.at(-1).squares[0].events[0].chord='F#';}});await wait(220);await page.evaluate(()=>scrollTo(0,1200));await wait(120);
  const orig=await page.evaluate(()=>({song:JSON.stringify(StruChordTracks.exportForSave()),bar:document.querySelector('.transport-bar').getBoundingClientRect().height}));
  await page.click('#b39KeysBtn');await wait(120);
  const m=await page.evaluate(()=>{const p=document.querySelector('#b39KeysPanel'),r=p.getBoundingClientRect(),svg=p.querySelector('svg'),key=svg.querySelector('rect').getBoundingClientRect(),bar=document.querySelector('.transport-bar').getBoundingClientRect();return {panel:r.toJSON(),svg:svg.getBoundingClientRect().toJSON(),key:key.toJSON(),bar:bar.toJSON(),scroll:p.scrollTop,overflow:getComputedStyle(p).overflowY};});
  const label=`${width}x${height}/${scale}%`;assert(m.key.height>=100*scale/100-.5,label+' увеличенная высота');assert(Math.abs(m.key.width-28*scale/100)<1,label+' ширина не изменилась');assert(Math.abs(m.bar.height-orig.bar)<.5,label+' плеер не изменён');assert(m.svg.bottom<=m.panel.bottom-1 && m.panel.top>=m.bar.bottom-1,label+' клавиатура не обрезана');assert.equal(m.overflow,'visible');assert.equal(await page.evaluate(()=>JSON.stringify(StruChordTracks.exportForSave())),orig.song);
  await page.click('#b39KeysSettingsToggle');await wait(80);const d=await page.evaluate(()=>{let p=document.querySelector('#b39KeysPanel'),s=p.querySelector('#b39KeysSettings').getBoundingClientRect(),r=p.getBoundingClientRect();return {bottom:r.bottom,settingsBottom:s.bottom,overflow:getComputedStyle(p).overflowY}});assert(d.settingsBottom<=d.bottom+1 && d.bottom<height,label+' настройки видны');assert.equal(d.overflow,'visible');
  assert.deepStrictEqual(errors,[]);await page.close();
 }
 console.log('B-39: более вытянутые клавиши без изменения ширины и плеера — OK');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});

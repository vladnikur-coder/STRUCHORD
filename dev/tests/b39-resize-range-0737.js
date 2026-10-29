/* Смена диапазона после ручного размера: рамка следует клавиатуре, масштаб неизменен. */
const assert=require('assert'),puppeteer=require('puppeteer');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const browser=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'/tmp/chromium',args:['--no-sandbox']});try{
 for(const [width,height,scale] of [[1920,1080,100],[1440,900,125],[1280,720,150]]){
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width,height});await page.evaluateOnNewDocument(s=>{localStorage.setItem('struchord-default-instrument','keys');localStorage.setItem('struchord-ui-scale',String(s));},scale);await page.goto(process.env.STRUCHORD_URL||'http://127.0.0.1:8000/STRUCHORD.html');
  await page.evaluate(()=>{startNewSongFromHome();addSection('Verse');sections[0].squares[0].events[0].chord='F#';StruChordTracks.setTrackKeyboardSize(1,88);StruChordKeys.open();});await wait(250);
  const measure=()=>page.evaluate(()=>{let p=document.querySelector('#b39KeysPanel'),s=p.querySelector('svg'),b=p.querySelector('.b39-keys-body');return {p:p.getBoundingClientRect().toJSON(),s:s.getBoundingClientRect().toJSON(),key:s.querySelector('rect').getBoundingClientRect().toJSON(),body:b.getBoundingClientRect().toJSON(),scroll:b.scrollWidth,client:b.clientWidth,visible:!document.querySelector('#b39KeysSettings').hidden,page:document.documentElement.scrollWidth};});
  const rect=await page.$eval('.b39-keys-resize--left',e=>e.getBoundingClientRect().toJSON());await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down();await page.mouse.move(rect.x+rect.width/2+100,rect.y+rect.height/2,{steps:10});await page.mouse.up();await wait(100);
  const original=await measure(),tag=`${width}/${scale}%`;assert(original.scroll>original.client,'длинная клавиатура прокручивается');await page.click('#b39KeysSettingsToggle');
  for(const size of [25,37,88,37,25]){
   await page.select('#b39KeysTrackSize',String(size));await wait(100);const a=await measure();
   assert(Math.abs(a.key.width-original.key.width)<.2 && Math.abs(a.key.height-original.key.height)<.2,`${tag}/${size}: масштаб не меняется ${JSON.stringify({original:original.key,now:a.key})}`);
   assert(Math.abs((a.p.left+a.p.right)/2-width/2)<2,`${tag}/${size}: панель по центру`);assert(a.page<=width+1,`${tag}/${size}: страница не расширяется`);
   if(size!==88 && a.s.width+40<width){assert(Math.abs(a.s.left-a.body.left)<2 && Math.abs(a.s.right-a.body.right)<2,`${tag}/${size}: края рядом с клавиатурой ${JSON.stringify(a)}`);assert(a.p.width<original.p.width-20,`${tag}/${size}: панель сужается`);}else if(a.s.width>a.body.width+1) assert(a.scroll>a.client,`${tag}/${size}: длинная клавиатура прокручивается`);
   assert(a.visible,`${tag}: настройки остались открыты`);
  }
  await page.click('#b39KeysSettingsToggle');const before=await measure();await page.evaluate(()=>{StruChordKeys.close();StruChordKeys.open();});await wait(100);const after=await measure();assert(Math.abs(before.p.width-after.p.width)<1 && Math.abs(before.key.width-after.key.width)<.2,'размер после закрытия сохраняется');assert.deepStrictEqual(errors,[]);await page.close();
 }
 console.log('B-39: переключение диапазонов подгоняет панель без изменения масштаба — OK');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});

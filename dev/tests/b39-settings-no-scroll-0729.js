/* Компьютер: развёрнутые настройки видны целиком, без внутренней вертикальной прокрутки. */
const assert=require('assert'),puppeteer=require('puppeteer');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'/tmp/chromium',args:['--no-sandbox']});try{
 for(const [width,height,scale] of [[1920,1080,100],[1440,900,125],[1366,768,125],[1280,720,150]]){
  const p=await b.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width,height});
  await p.evaluateOnNewDocument(s=>{localStorage.setItem('struchord-default-instrument','keys');localStorage.setItem('struchord-ui-scale',String(s));},scale);
  await p.goto(process.env.STRUCHORD_URL||'http://127.0.0.1:8000/STRUCHORD.html');
  await p.evaluate(()=>{startNewSongFromHome();for(let i=0;i<15;i++){addSection('Verse');sections.at(-1).squares[0].events[0].chord='C';}StruChordKeys.open();});await wait(220);await p.evaluate(()=>window.scrollTo(0,1200));await wait(160);
  const before=await p.evaluate(()=>JSON.stringify(StruChordTracks.exportForSave()));
  const measure=()=>p.evaluate(()=>{let p=document.querySelector('#b39KeysPanel'),r=p.getBoundingClientRect(),s=p.querySelector('#b39KeysSettings'),style=getComputedStyle(p),body=p.querySelector('.b39-keys-body');return {rect:r.toJSON(),keyboard:body.getBoundingClientRect().toJSON(),settings:s.getBoundingClientRect().toJSON(),key:body.querySelector('svg rect').getBoundingClientRect().height,overflow:style.overflowY,max:style.maxHeight,scroll:p.scrollTop,expanded:p.querySelector('#b39KeysSettingsToggle').getAttribute('aria-expanded')};});
  let d=await measure();assert(d.rect.bottom<=height/4+1 || d.key<=48*scale/100+1);assert.equal(d.overflow,'visible');
  await p.click('#b39KeysSettingsToggle');await wait(100);d=await measure();const label=`${width}x${height}/${scale}`;
  assert.equal(d.max,'none',label);assert.equal(d.overflow,'visible',label);assert(d.settings.top>=d.keyboard.bottom-1 && d.settings.bottom<=d.rect.bottom+1,label+' всё содержимое внутри панели');assert(d.keyboard.height>0,label+' клавиатура не исчезает');assert.equal(d.expanded,'true');assert(d.rect.bottom<height,label+' всё видно в окне');
  assert.equal(await p.evaluate(()=>JSON.stringify(StruChordTracks.exportForSave())),before,'открытие настроек не меняет песню');
  await p.click('#b39LinkedVoicings');await wait(80);d=await measure();
  const reset=await p.$eval('#b39LinkedReset',e=>({hidden:e.hidden,rect:e.getBoundingClientRect().toJSON()}));assert(!reset.hidden && reset.rect.bottom<=d.rect.bottom+1 && reset.rect.bottom<height,label+' нижнее управление видно');
  await p.mouse.move(d.rect.left+30,d.rect.bottom-10);const y=await p.evaluate(()=>window.scrollY);await p.mouse.wheel({deltaY:200});await wait(140);const after=await p.evaluate(()=>({y:scrollY,panel:document.querySelector('#b39KeysPanel').scrollTop}));assert(after.y>y && after.panel===0,label+' колесо прокручивает страницу, а не панель');
  await p.click('#b39KeysSettingsToggle');await wait(80);d=await measure();assert(d.rect.bottom<=height/4+1 || d.key<=48*scale/100+1,label+' компактный вид восстановлен');assert.equal(d.overflow,'visible');assert.equal(d.expanded,'false');
  assert.deepStrictEqual(errors,[]);await p.close();
 }
 console.log('B-39: раскрытие без лимита и вертикальной прокрутки, клавиатура и управление — OK');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});

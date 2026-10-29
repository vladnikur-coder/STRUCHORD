/* Проверка реального раскрытия: настройки видны без предварительной прокрутки. */
const assert=require('assert'), puppeteer=require('puppeteer');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'/tmp/chromium',args:['--no-sandbox']});try{
 for(const [width,height,scale] of [[1920,1080,125],[1440,900,125],[1366,768,125],[1280,720,150]]){
  const p=await b.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width,height});
  await p.evaluateOnNewDocument(s=>{localStorage.setItem('struchord-default-instrument','keys');localStorage.setItem('struchord-ui-scale',String(s));},scale);
  await p.goto(process.env.STRUCHORD_URL||'http://127.0.0.1:8000/STRUCHORD.html');
  await p.evaluate(()=>{startNewSongFromHome();for(let i=0;i<15;i++){addSection('Verse');sections.at(-1).squares[0].events[0].chord='C';}StruChordKeys.open();});await wait(250);await p.evaluate(()=>window.scrollTo(0,1200));await wait(120);
  const before=await p.evaluate(()=>JSON.stringify(StruChordTracks.exportForSave()));await p.click('#b39KeysSettingsToggle');await wait(80);
  const info=await p.evaluate(()=>{const p=document.querySelector('#b39KeysPanel'),r=p.getBoundingClientRect(),b=p.querySelector('.b39-keys-body'),size=p.querySelector('#b39KeysTrackSize').getBoundingClientRect(),tone=p.querySelector('[aria-label="Тембр"]').getBoundingClientRect();return {panel:r.toJSON(),size:size.toJSON(),tone:tone.toJSON(),keyboardHidden:b.hidden,settingsHidden:p.querySelector('#b39KeysSettings').hidden,expanded:p.querySelector('#b39KeysSettingsToggle').getAttribute('aria-expanded'),scrollTop:p.scrollTop};});
  const label=`${width}x${height} ${scale}%`;assert(info.panel.bottom<=height/4+1,label+' четверть окна');assert(info.keyboardHidden && !info.settingsHidden && info.expanded==='true',label+' настройки вместо клавиш');assert.equal(info.scrollTop,0);
  for(const c of [info.size,info.tone])assert(c.top>=info.panel.top && c.bottom<=info.panel.bottom,label+' первое управление полностью видно без прокрутки');
  assert.equal(await p.evaluate(()=>JSON.stringify(StruChordTracks.exportForSave())),before,label+' открытие не меняет песню');
  await p.select('#b39KeysTrackSize','49');assert.equal((await p.evaluate(()=>StruChordTracks.track(1))).keyboardSize,49);
  if (width===1280) {
   await p.mouse.move(info.panel.left+info.panel.width/2,info.panel.bottom-8);await p.mouse.wheel({deltaY:300});await wait(100);
   const check=await p.$eval('#b39LinkedVoicings',e=>{let r=e.getBoundingClientRect(),p=document.querySelector('#b39KeysPanel').getBoundingClientRect();return r.top>=p.top && r.bottom<=p.bottom;});assert(check,'нижняя настройка доступна колесом');
   await p.mouse.wheel({deltaY:-300});await wait(100);
  }
  await p.click('#b39KeysSettingsToggle');await wait(80);assert(await p.$eval('#b39KeysSettings',e=>e.hidden));assert(!(await p.$eval('.b39-keys-body',e=>e.hidden)));assert.equal(await p.$eval('#b39KeysSettingsToggle',e=>e.getAttribute('aria-expanded')),'false');
  assert.equal((await p.evaluate(()=>StruChordTracks.track(1))).keyboardSize,49);assert.deepStrictEqual(errors,[]);await p.close();
 }
 console.log('B-39: настройки видны сразу, управление, возврат клавиш и четверть экрана — OK');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});

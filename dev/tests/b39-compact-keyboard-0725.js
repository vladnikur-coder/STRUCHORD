/* Компактная клавиатура: схема в центре, настройки доступны отдельно. */
const assert=require('assert'),puppeteer=require('puppeteer');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'/tmp/chromium',args:['--no-sandbox']});try{
 for(const [width,height] of [[1440,900],[390,844],[320,640],[844,390]]){
  const p=await b.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width,height});
  await p.evaluateOnNewDocument(()=>{localStorage.setItem('struchord-default-instrument','keys');localStorage.setItem('struchord-ui-scale','125');});
  await p.goto(process.env.STRUCHORD_URL||'http://127.0.0.1:8000/STRUCHORD.html',{waitUntil:'load'});
  await p.evaluate(()=>{startNewSongFromHome();for(let i=0;i<12;i++){addSection('Verse');sections.at(-1).squares[0].events[0].chord='C';}StruChordKeys.open();});await wait(200);
  const before=await p.evaluate(()=>JSON.stringify(StruChordTracks.exportForSave()));await p.evaluate(()=>window.scrollTo(0,1100));await wait(150);
  const d=await p.evaluate(()=>{const p=document.querySelector('#b39KeysPanel'),b=p.querySelector('.b39-keys-body'),bar=document.querySelector('.transport-bar'),r=p.getBoundingClientRect(),k=b.getBoundingClientRect();return {height:r.height,kh:k.height,top:r.top,bottom:r.bottom,bar:bar.getBoundingClientRect().bottom,view:innerWidth,page:document.documentElement.scrollWidth,buttons:[...p.querySelectorAll('.b39-keys-head button')].map(b=>b.getBoundingClientRect().toJSON()),keyboard:k.toJSON()};});
  assert(d.height<255,`компактная высота ${width}: ${d.height}`);assert(d.kh/d.height>.48,`клавиатура занимает основную часть ${width}: ${d.kh}/${d.height}`);
  assert(d.top>=d.bar-1 && d.page<=d.view,`закрепление и ширина ${width}`);
  assert(d.buttons.every(x=>x.top>=d.top && x.bottom<=d.keyboard.top+1),'все кнопки над клавишами');
  assert.equal(await p.$eval('#b39KeysSettingsToggle',e=>e.getAttribute('aria-expanded')),'false');assert(await p.$eval('#b39KeysSettings',e=>e.hidden));
  assert.equal(await p.evaluate(()=>JSON.stringify(StruChordTracks.exportForSave())),before,'открытие и прокрутка не меняют данные');
  // Ручной выбор расположения остаётся на виду и работает без настроек.
  await p.click('[aria-label="Следующая позиция"]');let choice=await p.evaluate(()=>StruChordTracks.track(1).voicings);assert(Object.keys(choice).length,'переключение позиции доступно');
  await p.click('#b39KeysSettingsToggle');assert.equal(await p.$eval('#b39KeysSettingsToggle',e=>e.getAttribute('aria-expanded')),'true');assert(!(await p.$eval('#b39KeysSettings',e=>e.hidden)));
  assert(await p.$('#b39LinkedVoicings'));assert(await p.$('[aria-label="Тембр"]'));
  await p.select('#b39KeysTrackSize','25');await p.click('#b39KeysSettingsToggle');let h25=await p.$eval('.b39-keys-body svg',e=>e.getBoundingClientRect().height);
  await p.click('#b39KeysSettingsToggle');await p.select('#b39KeysTrackSize','88');await p.click('#b39KeysSettingsToggle');let h88=await p.$eval('.b39-keys-body svg',e=>e.getBoundingClientRect().height);await p.click('#b39KeysSettingsToggle');
  assert(h25>0 && h88>0 && Math.abs(h25-h88)<1,`высота клавиш не раздувается на 25 клавишах: ${h25}/${h88}`);
  assert.equal((await p.evaluate(()=>StruChordTracks.track(1))).keyboardSize,88);
  await p.evaluate(()=>{document.querySelector('#b39KeysPanel').scrollTop=0;});await p.click('#b39KeysSettingsToggle');assert(await p.$eval('#b39KeysSettings',e=>e.hidden));
  assert.equal((await p.evaluate(()=>StruChordTracks.track(1))).keyboardSize,88,'сворачивание не меняет настройки');
  await p.click('#b39KeysSettingsToggle');assert.equal(await p.$eval('#b39KeysTrackSize',e=>e.value),'88','при повторном открытии виден размер дорожки');
  assert.deepStrictEqual(errors,[]);await p.close();
 }
 console.log('B-39: компактность, приоритет клавиш, настройки, размеры и закрепление — OK');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});

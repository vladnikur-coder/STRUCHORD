/* B-39: встроенная панель клавиатуры, контекст и мобильная прокрутка. */
const assert = require('assert');
const puppeteer = require('puppeteer');
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
 const browser = await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'/tmp/chromium', args:['--no-sandbox']});
 try {
  const page=await browser.newPage(), errors=[];
  page.on('pageerror', e=>errors.push(e.message));
  await page.setViewport({width:1440,height:900});
  await page.evaluateOnNewDocument(()=>localStorage.setItem('struchord-default-instrument','keys'));
  await page.goto(process.env.STRUCHORD_URL||'http://127.0.0.1:8000/STRUCHORD.html',{waitUntil:'load'});
  await page.evaluate(()=>{startNewSongFromHome();addSection('Verse');songStore.dispatch('test/chords',()=>{sections[0].squares[0].events[0].chord='C';sections[0].squares[0].events[1].chord='G';});});
  await page.waitForSelector('.chord-wrapper[data-ei="1"]'); await wait(200);
  const before=await page.evaluate(()=>JSON.stringify(StruChordTracks.exportForSave()));
  await page.click('#b39KeysBtn');
  assert.equal(await page.evaluate(()=>JSON.stringify(StruChordTracks.exportForSave())),before,'открытие не меняет данные песни');
  let layout=await page.evaluate(()=>{const p=document.querySelector('#b39KeysPanel'),bar=document.querySelector('.transport-bar'),s=document.querySelector('#sectionsContainer');return {next:bar.nextElementSibling===p,position:getComputedStyle(p).position,bar:bar.getBoundingClientRect().bottom,panel:p.getBoundingClientRect().toJSON(),section:s.getBoundingClientRect().top,title:p.querySelector('.b39-keys-title').textContent,context:p.querySelector('.b39-keys-context').textContent};});
  assert(layout.next && layout.position==='sticky' && layout.panel.top>=layout.bar && layout.section>=layout.panel.bottom,'панель находится под транспортом и перед песней');
  assert.match(layout.title,/C/);assert.match(layout.context,/Куплет.*ячейка 1/);
  assert.equal(await page.$('[aria-label="Размер клавиатуры песни"]'), null);assert(await page.$('[aria-label="Размер клавиатуры дорожки"]'));
  // Настоящее нажатие по ячейке (включая двойное) изменяет контекст, не чужие дорожки.
  await page.evaluate(()=>document.querySelector('.chord-wrapper[data-ei="1"]').scrollIntoView({block:'end'}));
  await page.click('.chord-wrapper[data-ei="1"]',{clickCount:2,delay:60}); await wait(100);
  let pos=await page.evaluate(()=>StruChordKeys.last()); assert.equal(pos.chord,'G');assert(pos.cellKey.endsWith(':1'));
  const other=await page.evaluate(()=>{let T=StruChordTracks,s=sections[0],q=s.squares[0],id=T.addTrack('keys');T.setTrackChord(id,T.cellKey(s,q,1),'Am');return id;});
  await wait(200);
  pos=await page.evaluate(()=>StruChordKeys.last()); assert.equal(pos.trackId,other);assert.equal(pos.chord,'Am');
  assert.match(await page.$eval('.b39-keys-title',e=>e.textContent),/Am/);
  await page.evaluate(id=>{let T=StruChordTracks,s=sections[0],q=s.squares[0];T.setTrackChord(id,T.cellKey(s,q,1),'');},other);
  await wait(150); pos=await page.evaluate(()=>StruChordKeys.last()); assert.equal(pos.chord,null);
  assert.match(await page.$eval('.b39-keys-body',e=>e.textContent),/нет аккорда активной дорожки/);
  await page.evaluate(()=>StruChordTracks.setActive(1)); await wait(100); assert.equal((await page.evaluate(()=>StruChordKeys.last())).chord,'G');
  await page.evaluate(()=>songStore.dispatch('test/change-chord',()=>{sections[0].squares[0].events[1].chord='Dm';}));
  assert.equal((await page.evaluate(()=>StruChordKeys.last())).chord,'Dm','правка аккорда обновляет панель');
  // Моделируем реальное уведомление транспорта, в том числе пустую ячейку.
  const playback=await page.evaluate(async()=>{const s=sections[0],q=s.squares[0],ctx=getAudioContext();await ctx.resume();StruChordAudio.scheduleEvent(ctx,s,q,q.events[0],0,ctx.currentTime+.1,.3,120,'4/4');return StruChordKeys.last();});
  assert.equal(playback.chord,'C');
  // Настройки всей дорожки остаются независимы от секций и других дорожек.
  await page.click('#b39KeysSettingsToggle');
  await page.select('#b39KeysTrackSize','49'); assert.equal((await page.evaluate(()=>StruChordTracks.track(1))).keyboardSize,49);
  assert.equal((await page.evaluate(id=>StruChordTracks.track(id),other)).keyboardSize,null);
  await page.evaluate(()=>StruChordTracks.setTrackKeyboardSize(1,null));
  // Режимы размера, вкл. 88: ширина страницы не растёт, ноты не сплющиваются.
  for(const width of [320,390,768,1440]) {
   await page.setViewport({width,height:900});
   for(const size of [25,61,88]) {
    await page.select('#b39KeysTrackSize',String(size));
    const m=await page.evaluate(()=>{const p=document.querySelector('#b39KeysPanel'),body=p.querySelector('.b39-keys-body'),svg=body.querySelector('svg'),r=svg.getBoundingClientRect(), key=svg.querySelector('rect'),bar=document.querySelector('.transport-bar'),section=document.querySelector('#sectionsContainer');return {page:document.documentElement.scrollWidth,view:innerWidth,panel:p.getBoundingClientRect().toJSON(),bar:bar.getBoundingClientRect().bottom,section:section.getBoundingClientRect().top,body:body.clientWidth,scroll:body.scrollWidth,key:key.getBoundingClientRect().width,svg:r.width};});
    assert(m.page<=m.view+1,`страница ${width}/${size} без бокового переполнения (${m.page})`);
    assert(m.panel.width<=m.view,`панель в потоке ${width}/${size}`);
    assert(m.key>=18,`клавиши читаемого размера ${width}/${size}: ${m.key}`);
    if(width<=390 && size>=61)assert(m.scroll>m.body,`длинную клавиатуру можно прокрутить ${width}/${size}`);
   }
  }
  await page.setViewport({width:390,height:900}); await page.select('#b39KeysTrackSize','88');
  const scroll=await page.evaluate(()=>{const b=document.querySelector('.b39-keys-body');b.scrollLeft=0;const left=b.scrollLeft; b.scrollLeft=b.scrollWidth;const right=b.scrollLeft;StruChordKeys.render();return {left,right,after:b.scrollLeft,max:b.scrollWidth-b.clientWidth};});
  assert.equal(scroll.left,0);assert(scroll.right>0);assert.equal(scroll.after,scroll.right,'перерисовка не сбрасывает ручную прокрутку');
  // Размер по-прежнему сохраняется для всей дорожки и отменяется историей.
  await page.evaluate(()=>{captureHistorySnapshot();StruChordTracks.setTrackKeyboardSize(1,37);captureHistorySnapshot();});
  assert.equal((await page.evaluate(()=>StruChordTracks.exportForSave())).tracks[0].keyboardSize,37);
  await page.evaluate(()=>undoEdit()); await wait(180);
  assert.equal((await page.evaluate(()=>StruChordTracks.track(1))).keyboardSize,88,'undo возвращает размер дорожки');
  await page.evaluate(()=>redoEdit()); await wait(180);
  assert.equal((await page.evaluate(()=>StruChordTracks.track(1))).keyboardSize,37,'redo возвращает изменённый размер');
  assert.equal((await page.evaluate(id=>StruChordTracks.track(id),other)).keyboardSize,null);
  // Закреплённая аппликатура и встроенная панель не перекрывают друг друга;
  // повторные обновления при проигрывании не раскачивают отступ.
  await page.setViewport({width:1440,height:900});
  const pinned=await page.evaluate(()=>{window.scrollTo(0,0);const s=sections[0],q=s.squares[0];pinnedFingering={secId:s.id,squareId:q.id,eventIndex:0,chord:'C',shape:null};renderPinnedFingering();updatePinnedShift();const p=document.querySelector('#b39KeysPanel'),r=document.querySelector('#pinnedRow');const before=p.style.marginTop;for(let i=0;i<5;i++)updatePinnedShift();return {top:p.getBoundingClientRect().top,bottom:r.getBoundingClientRect().bottom,before,after:p.style.marginTop};});
  assert(pinned.top>=pinned.bottom-1,'панель не перекрывает закреплённую аппликатуру');assert.equal(pinned.before,pinned.after,'отступ стабилен при повторном пересчёте');
  await page.evaluate(()=>unpinFingering());
  assert.equal(await page.$eval('#b39KeysPanel',e=>e.style.marginTop),'','отступ снят после открепления');
  await page.keyboard.press('Escape'); assert(await page.$eval('#b39KeysPanel',e=>e.hidden),'Escape закрывает панель');
  assert.equal(await page.$eval('#b39KeysBtn',e=>e.getAttribute('aria-pressed')),'false');
  // При новом содержимом по тому же ключу старая строка не остаётся.
  await page.evaluate(()=>{songStore.dispatch('test/empty',()=>{sections[0].squares[0].events[0].chord='';sections[0].squares[0].events[1].chord='';});StruChordKeys.open();});
  assert.equal((await page.evaluate(()=>StruChordKeys.last())).chord,null);
  assert.match(await page.$eval('.b39-keys-body',e=>e.textContent),/нет аккорда/);
  // Настоящий вход с телефона: «Ещё» раскрывает клавиатуру и микшер.
  const mobile=await browser.newPage(); await mobile.setViewport({width:390,height:844});
  await mobile.evaluateOnNewDocument(()=>localStorage.setItem('struchord-default-instrument','keys'));
  await mobile.goto(process.env.STRUCHORD_URL||'http://127.0.0.1:8000/STRUCHORD.html',{waitUntil:'load'});
  await mobile.evaluate(()=>{startNewSongFromHome();addSection('Verse');sections[0].squares[0].events[0].chord='C';requestRender();}); await wait(250);
  assert.equal(await mobile.$eval('#b39KeysBtn',e=>getComputedStyle(e).display),'none');
  await mobile.click('#btnTransportMore'); await wait(150);
  assert.notEqual(await mobile.$eval('#b39KeysBtn',e=>getComputedStyle(e).display),'none');
  assert.notEqual(await mobile.$eval('.b39-wrap',e=>getComputedStyle(e).display),'none');
  await mobile.click('#b39KeysBtn'); await wait(400);
  const opened=await mobile.evaluate(()=>{const p=document.querySelector('#b39KeysPanel'),b=document.querySelector('.transport-bar');return {hidden:p.hidden,top:p.getBoundingClientRect().top,barBottom:b.getBoundingClientRect().bottom,view:innerHeight};});
  assert(!opened.hidden && opened.top>=opened.barBottom-1 && opened.top<opened.view,'открытая панель видна под плеером');
  await mobile.close();
  assert.deepStrictEqual(errors,[]);
  console.log('B-39: встроенная панель, выбор ячейки, смена дорожки, пустота и размеры — OK');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});

/* Читаемый размер изображения клавиш не меняет число клавиш дорожки или плеер. */
const assert=require('assert'),puppeteer=require('puppeteer');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'/tmp/chromium',args:['--no-sandbox']});try{
 for(const [width,height,scale] of [[1920,1080,100],[1440,900,125],[1366,768,125],[1280,720,150]]){
  const p=await b.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width,height});
  await p.evaluateOnNewDocument(s=>{localStorage.setItem('struchord-default-instrument','keys');localStorage.setItem('struchord-ui-scale',String(s));},scale);
  await p.goto(process.env.STRUCHORD_URL||'http://127.0.0.1:8000/STRUCHORD.html');
  await p.evaluate(()=>{startNewSongFromHome();for(let i=0;i<15;i++){addSection('Verse');sections.at(-1).squares[0].events[0].chord='C';}});await wait(220);await p.evaluate(()=>scrollTo(0,1200));await wait(120);
  const before=await p.evaluate(()=>JSON.stringify(StruChordTracks.exportForSave()));await p.click('#b39KeysBtn');await wait(100);
  const measure=()=>p.evaluate(()=>{let panel=document.querySelector('#b39KeysPanel'),body=panel.querySelector('.b39-keys-body'),svg=body.querySelector('svg'),key=svg.querySelector('rect').getBoundingClientRect(),r=panel.getBoundingClientRect(),bar=document.querySelector('.transport-bar').getBoundingClientRect(),txt=svg.querySelector('text');return {key:key.toJSON(),panel:r.toJSON(),svg:svg.getBoundingClientRect().toJSON(),bar:bar.toJSON(),cw:body.clientWidth,sw:body.scrollWidth,font:txt&&txt.getAttribute('font-size'),page:document.documentElement.scrollWidth};});
  let d=await measure();let label=`${width}x${height}, ${scale}%`;assert(d.key.width>=28*scale/100-.5 && d.key.height>=72*scale/100-.5,`${label}: клавиши крупнее`);assert.equal(d.font,'11','подписи октав увеличены');assert(d.panel.top>=d.bar.bottom-1 && d.svg.bottom<=d.panel.bottom-1,`${label}: ничего не обрезано`);assert(d.page<=width+1,'страница без боковой прокрутки');assert.equal(await p.evaluate(()=>JSON.stringify(StruChordTracks.exportForSave())),before,'открытие не меняет песню');
  await p.click('#b39KeysSettingsToggle');await p.select('#b39KeysTrackSize','25');await p.click('#b39KeysSettingsToggle');let small=await measure();assert(Math.abs(small.key.width-d.key.width)<1 && Math.abs(small.key.height-d.key.height)<1,'размер изображения не зависит от числа клавиш');
  await p.click('#b39KeysSettingsToggle');await p.select('#b39KeysTrackSize','88');await p.click('#b39KeysSettingsToggle');let large=await measure();assert(Math.abs(small.key.width-large.key.width)<1 && Math.abs(small.key.height-large.key.height)<1);assert(large.sw>large.cw,'длинная клавиатура прокручивается');
  const scroll=await p.evaluate(()=>{let e=document.querySelector('.b39-keys-body');e.scrollLeft=e.scrollWidth;return e.scrollLeft});assert(scroll>0);
  await p.evaluate(()=>{document.getElementById('showFingers').checked=true;toggleFingersVisibility();});await wait(80);
  let warning=await p.evaluate(()=>{const panel=document.querySelector('#b39KeysPanel'),svg=panel.querySelector('svg'),t=[...svg.querySelectorAll('text')].find(t=>t.getAttribute('font-weight')==='700'),bbox=t&&t.getBBox(),v=svg.viewBox.baseVal;return {font:t&&t.getAttribute('font-size'),inSvg:bbox&&bbox.y>=0&&bbox.y+bbox.height<=v.height,text:panel.querySelector('.b39-keys-foot').textContent};});assert.equal(warning.font,'11');assert(warning.inSvg);assert.match(warning.text,/цифры условны/);
  assert.deepStrictEqual(errors,[]);await p.close();
 }
 console.log('B-39: крупные клавиши и подписи, диапазоны, прокрутка, пальцы и данные — OK');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});

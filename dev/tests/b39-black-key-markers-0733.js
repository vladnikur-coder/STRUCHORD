/* Положение меток геометрически проверяется на каждой чёрной клавише. */
const assert=require('assert'),puppeteer=require('puppeteer');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'/tmp/chromium',args:['--no-sandbox']});try{
 const p=await b.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1440,height:900});
 await p.evaluateOnNewDocument(()=>{localStorage.setItem('struchord-default-instrument','keys');localStorage.setItem('struchord-ui-scale','125');});
 await p.goto(process.env.STRUCHORD_URL||'http://127.0.0.1:8000/STRUCHORD.html');
 const tests=await p.evaluate(()=>{let failures=[],n=0,container=document.createElement('div');container.style.cssText='position:fixed;left:-10000px;top:0';document.body.append(container);
  // Разные размеры и регистры, все пять чёрных классов, с цифрами и без.
  for(const w of [16,28])for(const h of [66,72,78])for(const finger of [false,true])for(const m of [49,51,54,56,58,61,63,66,68,70,73,75,78,80,82]){
   let r=StruChordKeys.keyboardSVG(48,84,[m],{whiteW:w,whiteH:h,showFingers:finger,rootPc:m%12,labelFont:11,fingerFont:11});container.innerHTML=r.svg;
   let svg=container.querySelector('svg'),circle=svg.querySelector('circle'),c=circle.getBBox(),rects=[...svg.querySelectorAll('rect')].filter(e=>+e.getAttribute('height')===Math.round(h*.62)),target=rects.find(e=>{let x=+e.getAttribute('x'),z=+e.getAttribute('width');return Math.abs(x+z/2-(c.x+c.width/2))<.01});
   let k=target&&target.getBBox(),digit=svg.querySelector('text[font-weight="700"]'),t=digit&&digit.getBBox();n++;
   if(!k || c.x<k.x-.01 || c.x+c.width>k.x+k.width+.01 || c.y<k.y-.01 || c.y+c.height>k.y+k.height+.01) failures.push(`точка m=${m} w=${w} h=${h} fingers=${finger} c=${JSON.stringify(c)} k=${JSON.stringify(k)}`);
   if(finger && (!t || t.x<k.x-.01 || t.x+t.width>k.x+k.width+.01 || t.y<k.y-.01 || t.y+t.height>k.y+k.height+.01 || c.y+c.height>t.y))failures.push(`цифра m=${m} w=${w} h=${h} c=${JSON.stringify(c)} t=${JSON.stringify(t)}`);
  }
  container.remove();return {n,failures};});assert.equal(tests.n,180);assert.deepStrictEqual(tests.failures,[]);
 await p.evaluate(()=>{startNewSongFromHome();addSection('Verse');songStore.dispatch('test/black-chords',()=>{const e=sections[0].squares[0].events;e[0].chord='C#';e[1].chord='F#';});document.getElementById('showFingers').checked=true;StruChordKeys.open();});await wait(250);
 const before=await p.evaluate(()=>JSON.stringify(StruChordTracks.exportForSave()));
 // В настоящей панели и компактном превью чёрная тоника отмечена внутри окрашенной клавиши.
 const result=await p.evaluate(()=>{const box=svg=>{let circles=[...svg.querySelectorAll('circle')].map(e=>e.getBBox()),keys=[...svg.querySelectorAll('rect')].filter(e=>e.getAttribute('fill')==='var(--color-accent, #2f855a)').map(e=>e.getBBox());return circles.map(c=>keys.some(k=>c.x>=k.x-.01&&c.y>=k.y-.01&&c.x+c.width<=k.x+k.width+.01&&c.y+c.height<=k.y+k.height+.01));};let panel=document.querySelector('#b39KeysPanel svg');let wrap=document.createElement('div');wrap.style.cssText='position:fixed;left:-10000px;top:0';wrap.innerHTML=StruChordKeys.renderKeysVoicingSVG('C#',1);document.body.append(wrap);let preview=box(wrap.querySelector('svg'));wrap.remove();return {panel:box(panel),preview,foot:document.querySelector('#b39KeysPanel .b39-keys-foot').textContent};});
 assert(result.panel.length>0&&result.panel.every(Boolean),'панель: точки на подсвеченных клавишах');assert(result.preview.length>0&&result.preview.every(Boolean),'превью: точки на подсвеченных клавишах');assert.match(result.foot,/цифры условны/);assert.equal(await p.evaluate(()=>JSON.stringify(StruChordTracks.exportForSave())),before);assert.deepStrictEqual(errors,[]);
 await p.close();console.log('B-39: точки тоники и цифры на чёрных клавишах, панель и превью — OK');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});

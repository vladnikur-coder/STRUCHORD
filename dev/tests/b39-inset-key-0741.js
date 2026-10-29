/* Края каёмки, включая толщину линии, целиком внутри выбранных клавиш. */
const assert=require('assert'),puppeteer=require('puppeteer');
(async()=>{const browser=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'/tmp/chromium',args:['--no-sandbox']});try{
 const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1440,height:900});await p.evaluateOnNewDocument(()=>{localStorage.setItem('struchord-theme','light');localStorage.removeItem('struchord-scheme');localStorage.setItem('struchord-default-instrument','keys');});await p.goto(process.env.STRUCHORD_URL||'http://127.0.0.1:8000/STRUCHORD.html');
 const result=await p.evaluate(()=>{const box=document.createElement('div');box.style.cssText='position:fixed;left:-9999px;top:0';document.body.append(box);let bad=[],checked=0;
  for(const w of [14,16,28,55,90])for(const h of [12,40,100,260])for(const dark of [false,true]){
   document.documentElement.toggleAttribute('data-theme',dark);if(dark)document.documentElement.setAttribute('data-theme','dark');
   box.innerHTML=StruChordKeys.keyboardSVG(60,72,[60,61,64,66],{whiteW:w,whiteH:h,showFingers:true,rootPc:1}).svg;
   let svg=box.querySelector('svg'),keys=[...svg.querySelectorAll('rect')].filter(k=>k.getAttribute('fill')==='var(--color-accent, #2f855a)'),paths=[...svg.querySelectorAll('.b39-key-inset')];
   if(keys.length!==4||paths.length!==4)bad.push('число каёмок');
   for(const path of paths){let key=path.previousElementSibling,k=key.getBBox(),r=path.getBBox(),line=parseFloat(getComputedStyle(path).strokeWidth)/2;checked++;
    if(!key.matches('rect') || r.x-line<k.x-.001 || r.y-line<k.y-.001 || r.x+r.width+line>k.x+k.width+.001 || r.y+r.height+line>k.y+k.height+.001)bad.push(`выходит за клавишу ${w}x${h}`);
    if(getComputedStyle(path).fill!=='none'||getComputedStyle(path).pointerEvents!=='none'||getComputedStyle(path).filter!=='none'||!getComputedStyle(key).filter.startsWith('drop-shadow(')||getComputedStyle(key).stroke===getComputedStyle(path).stroke)bad.push(`стиль ${w}x${h}`);
   }
  }
  box.remove();document.documentElement.removeAttribute('data-theme');return {bad,checked};});assert.equal(result.checked,160);assert.deepStrictEqual(result.bad,[]);
 await p.evaluate(()=>{startNewSongFromHome();addSection('Verse');sections[0].squares[0].events[0].chord='C#';document.getElementById('showFingers').checked=true;StruChordKeys.open();});await new Promise(r=>setTimeout(r,150));const song=await p.evaluate(()=>JSON.stringify(StruChordTracks.exportForSave()));
 const views=await p.evaluate(()=>{let wrap=document.createElement('div');wrap.style.cssText='position:fixed;left:-9999px';wrap.innerHTML=StruChordKeys.renderKeysVoicingSVG('C#',1);document.body.append(wrap);let svgs=[document.querySelector('#b39KeysPanel svg'),wrap.querySelector('svg')],r=svgs.map(s=>({keys:s.querySelectorAll('rect[fill="var(--color-accent, #2f855a)"]').length,insets:s.querySelectorAll('.b39-key-inset').length,roots:s.querySelectorAll('circle').length,digits:s.querySelectorAll('text[font-weight="700"]').length}));wrap.remove();return r});for(const v of views)assert(v.keys>0&&v.insets===v.keys&&v.roots&&v.digits,'панель и превью с каёмкой и метками');assert.equal(await p.evaluate(()=>JSON.stringify(StruChordTracks.exportForSave())),song);assert.deepStrictEqual(errors,[]);console.log('B-39: внутренняя каёмка, свечение, метки и размеры клавиш — OK');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});

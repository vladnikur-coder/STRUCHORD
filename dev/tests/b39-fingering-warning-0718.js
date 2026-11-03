/* B-39: цифры на клавишах — рассчитанная аппликатура (0.781), а не нумерация.
   До 0.718 здесь стояло предупреждение «цифры условны». Теперь цифры считает
   рука, поэтому проверяем обратное: цифры есть, они из 1–5, и оговорки нет. */
const assert=require('assert'),puppeteer=require('puppeteer');
(async()=>{const browser=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'/tmp/chromium',args:['--no-sandbox']});try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:390,height:844});await page.goto(process.env.STRUCHORD_URL||'http://127.0.0.1:8031/STRUCHORD.html');await page.evaluate(()=>localStorage.setItem('struchord-default-instrument','keys'));await page.reload();
 await page.evaluate(()=>{startNewSongFromHome();addSection('Verse');sections[0].squares[0].events[0].chord='C';document.getElementById('showFingers').checked=true;StruChordKeys.open();});
 const on=await page.evaluate(()=>{const panel=document.querySelector('#b39KeysPanel'),svg=panel.querySelector('svg');const digits=[...svg.querySelectorAll('text.b39-key-finger')].map(t=>t.textContent);const compact=StruChordKeys.renderKeysVoicingSVG('C',1);return {aria:svg.getAttribute('aria-label'),foot:panel.querySelector('.b39-keys-foot').textContent,digits,compact,direct:StruChordKeys.keyboardSVG(48,72,[60,64,67],{showFingers:true}).svg};});
 assert(on.digits.length>0,'цифры аппликатуры нарисованы');assert(on.digits.every(d=>/^[1-5]$/.test(d)),'только пальцы 1–5: '+on.digits.join(''));
 assert.match(on.aria,/аппликатура/);assert.match(on.foot,/аппликатура/);assert.match(on.compact,/Аппликатура: 1 — большой, 5 — мизинец/);assert.match(on.direct,/Аппликатура: 1 — большой, 5 — мизинец/);
 assert(!/условн/.test(on.aria+on.foot+on.compact+on.direct),'оговорки «условны» больше нет');assert.match(on.compact,/Бас:|Окно /,'подпись баса не потеряна');
 // В прямом рендере трезвучие берётся 1-3-5, а не 1-2-3.
 assert.deepStrictEqual([...on.direct.matchAll(/class="b39-key-finger"[^>]*>([1-5])</g)].map(m=>m[1]),['1','3','5'],'C-E-G — 1-3-5');
 const off=await page.evaluate(()=>{document.getElementById('showFingers').checked=false;toggleFingersVisibility();const panel=document.querySelector('#b39KeysPanel');return {panel:panel.textContent,aria:panel.querySelector('svg').getAttribute('aria-label'),digits:panel.querySelectorAll('text.b39-key-finger').length,compact:StruChordKeys.renderKeysVoicingSVG('C',1)};});
 assert.equal(off.digits,0,'без галочки цифр нет');assert(!off.panel.includes('аппликатура'));assert(!/Аппликатура/.test(off.compact));assert.deepStrictEqual(errors,[]);
 console.log('B-39: цифры на клавишах — рассчитанная аппликатура (1–5), оговорки нет — OK');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});

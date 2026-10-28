#!/usr/bin/env node
// 0.678: реальный alphaTab, независимые SVG-линии и noteHeadBounds.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const chromium=require('@sparticuz/chromium').default,puppeteer=require('puppeteer-core');
const root=path.resolve(__dirname,'../..'),output=process.env.B12_CURSOR_RESULTS?path.resolve(process.env.B12_CURSOR_RESULTS):null;
const checks=[],errors=[];const wait=ms=>new Promise(r=>setTimeout(r,ms));
function check(name,ok,detail){checks.push({name,ok:!!ok,detail});console.log((ok?'ok   ':'FAIL ')+name+(ok?'':' '+JSON.stringify(detail)));assert.ok(ok,name)}
(async()=>{
 if(output)fs.mkdirSync(output,{recursive:true});
 const browser=await puppeteer.launch({executablePath:await chromium.executablePath(),args:chromium.args,headless:'shell',env:{...process.env,LD_LIBRARY_PATH:'/tmp/al2023/lib'}});
 try{
  for(const [width,height,mobile] of [[1280,900,false],[390,844,true],[1024,768,true]]){
   const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.setViewport({width,height,isMobile:mobile,hasTouch:mobile});
   await page.goto(process.env.STRUCHORD_URL||'http://127.0.0.1:8000/STRUCHORD.html',{waitUntil:'load'});
   await page.evaluate(()=>{startNewSongFromHome();addSection('Verse');addTabInsert(sections[0].id)});
   await page.waitForSelector('.tab-at-host svg',{timeout:30000});await wait(500);
   const state=()=>page.evaluate(()=>({cursor:{...tabAtCursor},beats:tabInsertEditorState.draft.beats,notes:tabInsertEditorState.draft.notes,history:tabInsertEditorState.history?.length||0}));
   const press=async key=>{await page.$eval('.tab-at-host',e=>e.focus());await page.keyboard.press(key);await wait(40)};
   const shot=async name=>{if(output)await page.screenshot({path:path.join(output,`${name}-${width}.png`)})};
   // Только реально нарисованные прямоугольники шести струн, не функция
   // геометрии приложения. Координаты относительно host, как у alphaTab.
   async function geometry(index=0){return page.evaluate(index=>{
    const host=document.querySelector('.tab-at-host'),hr=host.getBoundingClientRect();
    const bars=tabAtApi.boundsLookup.staffSystems.flatMap(s=>s.bars.flatMap(m=>m.bars));
    const b=bars.find(b=>b.bar.index===index),r=b.visualBounds;
    const lines=[...host.querySelectorAll('svg rect')].map(e=>{const d=e.getBoundingClientRect();return {x:d.x-hr.x,y:d.y-hr.y+d.height/2,w:d.width,h:d.height}}).filter(l=>l.h<3&&l.w>15&&l.x<r.x+r.w&&l.x+l.w>r.x&&l.y>=r.y-2&&l.y<=r.y+r.h+2).sort((a,b)=>a.y-b.y);
    const unique=lines.filter((l,i)=>!i||Math.abs(l.y-lines[i-1].y)>2);
    const first=b.beats[0].visualBounds, x0=first.x+first.w/2;
    return {lines:unique,bounds:r,x0,xEnd:r.x+r.w-8,bar:index};
   },index)}
   async function clickAt(x,y){
    await page.evaluate(({y})=>{const host=document.querySelector('.tab-at-host'),body=document.querySelector('.tab-editor-body'),h=host.getBoundingClientRect(),b=body.getBoundingClientRect();body.scrollTop+=h.top+y-(b.top+b.height/2)}, {y});
    const h=await page.$eval('.tab-at-host',e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y}});
    if(mobile)await page.touchscreen.tap(h.x+x,h.y+y);else await page.mouse.click(h.x+x,h.y+y);await wait(100);
   }
   const g=await geometry();check(`${width}: SVG действительно содержит шесть струн`,g.lines.length===6,g);
   let st=await state();const empty=await page.evaluate(()=>{const h=document.querySelector('.tab-at-host'),hr=h.getBoundingClientRect(),line=h.querySelector('.tab-at-cursor'),dot=h.querySelector('.tab-at-cursor-dot'),r=dot.getBoundingClientRect();return {hidden:line.hidden||dot.hidden,dotY:r.y+r.height/2-hr.y,x:parseFloat(line.style.left),top:parseFloat(line.style.top),bottom:parseFloat(line.style.top)+parseFloat(line.style.height),text:h.querySelector('.tab-at-cursor-readout').textContent}});
   check(`${width}: пустая вставка — курсор на 6-й струне, не посередине`,!empty.hidden&&st.notes.length===0&&st.cursor.start===0&&st.cursor.string===0&&Math.abs(empty.dotY-g.lines[5].y)<2,empty);
   check(`${width}: вертикаль пересекает все шесть струн`,empty.top<=g.lines[0].y&&empty.bottom>=g.lines[5].y,empty);
   await shot('empty');
   const starts=[];for(let i=0;i<3;i++){await press('ArrowRight');starts.push((await state()).cursor.start)}
   check(`${width}: пустые стрелки переходят по тактам, а не длительностям`,starts.join()==='4,8,12',starts);
   // 0.694: предела в 4 такта нет — четвёртая стрелка тоже добавляет такт.
   await press('ArrowRight');st=await state();check(`${width}: за концом четвёртого такта → добавляет следующий`,st.cursor.start===16&&st.beats===20,st);
   for(let i=0;i<4;i++){await page.keyboard.down('Control');await page.keyboard.press('KeyZ');await page.keyboard.up('Control');await wait(180);}
   for(let i=0;i<4;i++)await press('ArrowLeft');check(`${width}: влево до 0 и не дальше`,(await state()).cursor.start===0);
   const clicks=[];for(let string=0;string<6;string++){
    await clickAt(g.x0+(g.xEnd-g.x0)/2,g.lines[5-string].y);st=await state();clicks.push(st.cursor);
    check(`${width}: клик на струне ${6-string} в пустом такте даёт начало такта (GP8) и правильную струну`,st.cursor.string===string&&st.cursor.start===0,st.cursor);
   }
   await shot('clicked-empty');
   await press('Digit5');await wait(850);st=await state();check(`${width}: цифра 5 записана в начале такта без лишних пауз и НЕ сдвинула курсор`,st.notes.filter(n=>!n.pause).length===1&&st.notes[0].string===5&&st.notes[0].start===0&&st.notes[0].fret===5&&st.cursor.start===0&&st.cursor.string===5,st);
   const align=await page.evaluate(()=>{const h=document.querySelector('.tab-at-host'),hr=h.getBoundingClientRect(),d=h.querySelector('.tab-at-cursor-dot').getBoundingClientRect();const b=tabAtApi.boundsLookup.staffSystems.flatMap(s=>s.bars.flatMap(m=>m.bars)).flatMap(b=>b.beats).find(b=>b.notes?.length);const n=b.notes[0].noteHeadBounds;return {dx:Math.abs(parseFloat(h.querySelector('.tab-at-cursor').style.left)-(n.x+n.w/2)),dy:Math.abs(d.y+d.height/2-hr.y-(n.y+n.h/2))}});
   check(`${width}: курсор совпадает с настоящей головкой ноты ≤2 px`,align.dx<2&&align.dy<2,align);await shot('typed');
   const before=st.history;await press('Digit1');await press('Digit2');await wait(850);st=await state();check(`${width}: 1→2 = 12, курсор всё ещё на той же доле`,st.notes[0].fret===12&&st.cursor.start===0&&st.history===before+1,st);
   await page.keyboard.down('Control');await page.keyboard.press('KeyZ');await page.keyboard.up('Control');await wait(200);check(`${width}: двузначный лад — одно Undo`,(await state()).notes[0].fret===5);
   // Изменение длительности в пустом месте не правит уже введённую ноту.
   for(const [d,dot,triplet,step] of [[4,false,false,1],[8,false,false,.5],[16,false,false,.25],[64,false,false,.0625],[4,true,false,1.5],[8,false,true,1/3],[8,true,true,.5]]){
    await page.evaluate(()=>tabGpSetTime(tabInsertEditorState,0,0));
    await page.click(`[data-tab-dur="${d}"]`);
    for(const [flag,want] of [['dot',dot],['triplet',triplet]]){const on=await page.$eval(`[data-tab-flag="${flag}"]`,e=>e.getAttribute('aria-pressed')==='true');if(on!==want)await page.click(`[data-tab-flag="${flag}"]`)}
    await press('ArrowRight');const right=(await state()).cursor.start;await press('ArrowLeft');const left=(await state()).cursor.start;
    check(`${width}: ←/→ при вводе 1/${d}${dot?' с точкой':''}${triplet?' триоль':''} посещает записанную позицию`,Math.abs(right-step)<1e-6&&left===0,{right,left,expected:step});
   }
   await page.evaluate(()=>tabAtSetCursor(0,0));await page.click('[data-tab-dur="4"]');for(const flag of ['dot','triplet'])if(await page.$eval(`[data-tab-flag="${flag}"]`,e=>e.getAttribute('aria-pressed')==='true'))await page.click(`[data-tab-flag="${flag}"]`);
   await press('Digit1');await press('ArrowRight');await press('Digit2');
   st=await state();check(`${width}: перемещение разрывает склейку цифр`,st.notes.some(n=>n.start===0&&n.fret===1)&&st.notes.some(n=>n.start===1&&n.fret===2),st);
   // Несколько систем: клики в 1–4-м тактах, в т.ч. пустых, не уходят в первый.
   await page.select('[data-tab-beats]','16');await wait(500);
   for(let bar=0;bar<4;bar++){
    const mg=await geometry(bar);check(`${width}: такт ${bar+1} содержит шесть реальных линий`,mg.lines.length===6,mg);
    await clickAt(mg.x0+(mg.xEnd-mg.x0)*.5,mg.lines[5].y);st=await state();
    check(`${width}: клик в такте ${bar+1} остаётся в его системе/на 6-й струне`,st.cursor.start>=bar*4&&st.cursor.start<(bar+1)*4&&st.cursor.string===0,st.cursor);
    await press('Digit7');await wait(180);const match=await page.evaluate(()=>{const pos=tabAtCursorPosition(tabAtApi),b=tabAtBeatBoundsAt(tabAtApi,tabAtCursor.start),n=b?.notes.find(n=>n.note.string===tabAtCursor.string+1)?.noteHeadBounds;return {dy:n?Math.abs(pos.y-(n.y+n.h/2)):null,dx:n?Math.abs(pos.x-(n.x+n.w/2)):null}});
    check(`${width}: нота/курсор такта ${bar+1} совпадают после ввода`,match.dx!==null&&match.dx<2&&match.dy<2,match);
   }
   await shot('four-bars');
   // Последняя 1/64 такта не должна при клике обрезаться старой сеткой 1/16.
   await page.evaluate(()=>tabAtSetCursor(3.9375,0));await page.click('[data-tab-dur="64"]');await press('Digit9');await wait(250);
   const lastHead=await page.evaluate(()=>{const b=tabAtBeatBoundsAt(tabAtApi,3.9375),n=b.notes.find(n=>n.note.string===1).noteHeadBounds;return {x:n.x+n.w/2,y:n.y+n.h/2}});
   await page.evaluate(()=>tabAtSetCursor(0,0));await clickAt(lastHead.x,lastHead.y);st=await state();
   check(`${width}: клик по последней 1/64 сохраняет точное время/струну`,st.cursor.start===3.9375&&st.cursor.string===0,st.cursor);
   await page.close();
  }
  check('нет ошибок JavaScript',errors.length===0,errors);
  if(output){const html=fs.readFileSync(path.join(root,'STRUCHORD.html'));fs.writeFileSync(path.join(output,'checks.json'),JSON.stringify({sha256:crypto.createHash('sha256').update(html).digest('hex'),bytes:html.length,checks,errors},null,2)+'\n')}
  console.log(`${checks.length} ok / 0 FAIL`);
 }finally{await browser.close()}
})().catch(e=>{console.error(e.stack);process.exitCode=1});

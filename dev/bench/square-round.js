// Три проверки по замечаниям пользователя:
//   1. нижний квадрат секции скруглён (мешал бейдж повтора: он последний
//      ребёнок .squares-list, и .square:last-child не срабатывал);
//   2. тень квадрата не пропадает при зуме и во время жеста;
//   3. в ячейке порядок сверху вниз: ритм → ступень → имя аккорда.
const puppeteer=require('/home/user/node_modules/puppeteer');
const PNG=require('/home/user/node_modules/pngjs').PNG;const fs=require('fs');
const px=(f,x,y)=>{const png=PNG.sync.read(fs.readFileSync(f));return png.data[((png.width*y+x)<<2)];};
let bad=0;
const t=(n,c,x='')=>{if(c)console.log('   ok  ',n,x);else{bad++;console.log('  FAIL ',n,x)}};
(async()=>{
const b=await puppeteer.launch({args:['--no-sandbox']});
const p=await b.newPage();await p.setViewport({width:1200,height:900});
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('file:///home/user/STRUCHORD.html',{waitUntil:'networkidle0'});
await new Promise(r=>setTimeout(r,900));
const rhythm={mode:'strum',subdivision:2,steps:['D',null,'D','U',null,'U','D',null]};
await p.evaluate((rh)=>{sections=[{id:1,type:'Verse',repeat:2,squares:[
  {id:1,repeat:1,events:[{chord:'Am',span:4},{chord:'C',span:4,strumPattern:rh}]},
  {id:2,repeat:1,events:[{chord:'Dm',span:8}]},
  {id:3,repeat:1,events:[{chord:'E',span:8}]}]}];
  nextId=9;squareZoom=1;applySquareZoom(true);
  const cb=document.getElementById('showDegrees');if(cb)cb.checked=true;
  requestRender();},rhythm);
await new Promise(r=>setTimeout(r,700));
await p.evaluate(()=>updateCellsDegrees());
await new Promise(r=>setTimeout(r,300));

console.log('=== 1. Скругление крайних квадратов ===');
const rad=await p.evaluate(()=>[...document.querySelectorAll('.square-inner')]
  .map(e=>getComputedStyle(e).borderRadius));
t('верхний квадрат скруглён сверху', rad[0]==='18px 18px 0px 0px', rad[0]);
t('средний квадрат без скругления', rad[1]==='0px', rad[1]);
t('нижний квадрат скруглён снизу', rad[2]==='0px 0px 18px 18px', rad[2]);
// Именно поэтому скругление держится на классах, а не на :last-child:
// последний ребёнок .squares-list — не квадрат, а строка бейджа повтора.
const badgeLast=await p.evaluate(()=>{const l=document.querySelector('.squares-list');
  return {cls:l.lastElementChild.className,
    hasBadge:!!l.lastElementChild.querySelector?.('.section-repeat-badge-absolute')};});
t('последний ребёнок списка — строка бейджа повтора, не квадрат',
  /section-repeat-row/.test(badgeLast.cls)&&badgeLast.hasBadge, badgeLast.cls);
const one=await p.evaluate(()=>{sections[0].squares=[sections[0].squares[0]];requestRender();
  return new Promise(r=>setTimeout(()=>r(getComputedStyle(document.querySelector('.square-inner')).borderRadius),500));});
t('единственный квадрат скруглён кругом', one==='18px', one);
await p.evaluate((rh)=>{sections[0].squares=[
  {id:1,repeat:1,events:[{chord:'Am',span:4},{chord:'C',span:4,strumPattern:rh}]},
  {id:2,repeat:1,events:[{chord:'Dm',span:8}]}];requestRender();},rhythm);
await new Promise(r=>setTimeout(r,500));
await p.evaluate(()=>updateCellsDegrees());

console.log('\n=== 2. Тень квадрата и зум ===');
const shadow=async(file)=>{await new Promise(r=>setTimeout(r,400));
  await p.screenshot({path:'/home/user/dev/bench/'+file});const f='/home/user/dev/bench/'+file;
  const g=await p.evaluate(()=>{const i=[...document.querySelectorAll('.square-inner')].pop().getBoundingClientRect();
    return {b:Math.round(i.bottom),l:Math.round(i.left)};});
  return px(f,g.l+60,g.b+3);};
const s1=await shadow('sq-shadow-1x.png');
t('в покое тень есть', s1<253, `яркость под кромкой ${s1}/255`);
await p.evaluate(()=>{setSquareZoom(2.5);applySquareZoom(true);});
const s2=await shadow('sq-shadow-zoom.png');
t('при зуме 2.5× тень сохраняется', s2<253, `${s2}/255`);
await p.evaluate(()=>document.body.classList.add('is-zooming'));
const s3=await shadow('sq-shadow-zooming.png');
t('во время жеста тень сохраняется', s3<253, `${s3}/255`);
t('тень одинаковой глубины во всех трёх состояниях', Math.abs(s1-s2)<=2&&Math.abs(s1-s3)<=2,
  `${s1} / ${s2} / ${s3}`);
// Поле под тень (и под свисающий бейдж «×1») компенсируется равным
// отрицательным отступом, поэтому проверяем не абсолютный зазор, а то,
// что компенсация точная и раскладка не поехала.
const shift=await p.evaluate(()=>{const vp=document.querySelector('.squares-viewport');
  const row=document.querySelector('.square-actions-row');
  const cs=getComputedStyle(vp);
  return {gap:Math.round(row.getBoundingClientRect().top-vp.getBoundingClientRect().bottom),
    pb:parseFloat(cs.paddingBottom), mb:parseFloat(cs.marginBottom)};});
t('поле снизу скомпенсировано отрицательным отступом',
  Math.abs(shift.pb+shift.mb)<0.5, `padding ${shift.pb}, margin ${shift.mb}`);
t('поле под тень не раздвинуло раскладку',
  Math.abs(shift.gap+shift.pb)<10, `зазор ${shift.gap}px при поле ${shift.pb}px`);
await p.evaluate(()=>{document.body.classList.remove('is-zooming');resetSquareZoom();});
await new Promise(r=>setTimeout(r,500));

console.log('\n=== 3. Ступень стоит НАД именем, как в ленте ===');
await p.evaluate(()=>updateCellsDegrees());
await new Promise(r=>setTimeout(r,300));
const g=await p.evaluate(()=>{
  const ws=[...document.querySelectorAll('.chord-wrapper')];
  const one=(w)=>{const R=w.getBoundingClientRect();
    const rel=(e)=>e?{t:+(e.getBoundingClientRect().top-R.top).toFixed(1),
      b:+(e.getBoundingClientRect().bottom-R.top).toFixed(1),
      c:+(e.getBoundingClientRect().top+e.getBoundingClientRect().height/2-R.top).toFixed(1)}:null;
    const d=w.querySelector('.degree-hint');
    const nm=w.querySelector('.chord-display-inner');
    const rh=w.querySelector('.event-strum-preview.has-pattern');
    return {H:+R.height.toFixed(1),deg:rel(d),name:rel(nm),rh:rel(rh),
      inDisplay:!!(d&&d.parentElement&&d.parentElement.classList.contains('chord-display')),
      firstChild:!!(d&&d.parentElement&&d.parentElement.firstChild===d),
      pos:d?getComputedStyle(d).position:null, cls:w.className};};
  return {plain:one(ws[0]),withRh:one(ws[1])};});
console.log('   ',JSON.stringify(g));
t('ступень лежит внутри .chord-display', g.plain.inDisplay);
t('ступень — первая строка столбика', g.plain.firstChild);
t('ступень в потоке, не absolute', g.plain.pos==='static', g.plain.pos);
const gapPlain=+(g.plain.name.t-g.plain.deg.b).toFixed(1);
const gapRh=+(g.withRh.name.t-g.withRh.deg.b).toFixed(1);
t('ступень вплотную над именем (как в ленте, ~1px)', gapPlain<=3 && gapPlain>=0,
  `зазор ${gapPlain}px`);
t('в ячейке с боем зазор тот же', Math.abs(gapRh-gapPlain)<1.5, `${gapRh}px`);
t('ступень НЕ прижата к верхней кромке', g.plain.deg.t>8, `отступ сверху ${g.plain.deg.t}px`);
const groupC=+((g.plain.deg.t+g.plain.name.b)/2).toFixed(1);
t('пара «ступень + имя» центрирована в ячейке', Math.abs(groupC-g.plain.H/2)<3,
  `центр группы ${groupC} при высоте ${g.plain.H}`);
t('в ячейке с боем ритм выше ступени', g.withRh.rh.b<=g.withRh.deg.t,
  `ритм до ${g.withRh.rh.b}, ступень с ${g.withRh.deg.t}`);
t('ячейка с боем помечена has-cell-rhythm', /has-cell-rhythm/.test(g.withRh.cls));
t('ячейка без боя не помечена', !/has-cell-rhythm/.test(g.plain.cls));
// Подгонка имени переписывает innerHTML целиком — ступень лежит там же
// и без явного сохранения пропадала бы на каждом кадре зума.
const before=await p.evaluate(()=>document.querySelectorAll('.degree-hint').length);
await p.evaluate(()=>{document.querySelectorAll('.chord-display').forEach(e=>{e.__fitRaw=null;fitChordDisplay(e);});});
await new Promise(r=>setTimeout(r,200));
const alive=await p.evaluate(()=>document.querySelectorAll('.degree-hint').length);
t('ступень переживает подгонку имени (fitChordDisplay)', alive===before && before>0,
  `было ${before}, стало ${alive}`);
await p.evaluate(()=>{setSquareZoom(2.5);applySquareZoom(true);});
await new Promise(r=>setTimeout(r,500));
const aliveZoom=await p.evaluate(()=>{
  const n=document.querySelectorAll('.degree-hint').length;
  const first=document.querySelector('.degree-hint');
  return {n, inDisplay:!!(first&&first.parentElement.classList.contains('chord-display')),
    firstChild:!!(first&&first.parentElement.firstChild===first)};});
t('ступень переживает зум', aliveZoom.n===before, `${aliveZoom.n} из ${before}`);
t('после зума ступень осталась первой строкой', aliveZoom.inDisplay&&aliveZoom.firstChild);
await p.evaluate(()=>resetSquareZoom());
await new Promise(r=>setTimeout(r,400));
const off=await p.evaluate(()=>{const cb=document.getElementById('showDegrees');cb.checked=false;
  updateCellsDegrees();return new Promise(r=>setTimeout(()=>{
    const w=document.querySelector('.chord-wrapper');
    const nm=w.querySelector('.chord-display-inner').getBoundingClientRect();
    const R=w.getBoundingClientRect();
    return r({hints:document.querySelectorAll('.degree-hint').length,
      c:+(nm.top+nm.height/2-R.top).toFixed(1),H:+R.height.toFixed(1)});},400));});
t('при выключении ступени убираются', off.hints===0);
t('имя возвращается в центр ячейки', Math.abs(off.c-off.H/2)<2, `центр ${off.c} при ${off.H}`);
await (await p.$('.section-card')).screenshot({path:'/home/user/dev/bench/sq-round-after.png'});

t('ошибок страницы нет', errs.length===0, errs.join('; '));
console.log(bad?`\nПРОВАЛЕНО: ${bad}`:'\nВсе проверки пройдены');
await b.close();process.exit(bad?1:0);})();

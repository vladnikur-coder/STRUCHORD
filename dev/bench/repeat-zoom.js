// Бейдж повтора секции и зум.
//
// Инвариант: пока последний квадрат секции хоть частично виден, бейдж
// повтора обязан быть виден И кликабелен. Раньше он держался края
// квадрата процентным отступом — при зуме край уезжал за пределы окна
// вместе с бейджем (замер: край 1731px при вьюпорте 206..994).
const puppeteer=require('/home/user/node_modules/puppeteer');
let bad=0;
const t=(n,c,x='')=>{if(c)console.log('   ok  ',n,x);else{bad++;console.log('  FAIL ',n,x)}};
(async()=>{
const b=await puppeteer.launch({args:['--no-sandbox']});
const p=await b.newPage();await p.setViewport({width:1200,height:900});
const errs=[];p.on('pageerror',e=>errs.push(String(e).split('\n')[0]));
await p.goto('file:///home/user/STRUCHORD.html',{waitUntil:'networkidle0'});
await new Promise(r=>setTimeout(r,900));

const build=async(narrow,repeat)=>{
 await p.evaluate((n,rep)=>{sections=[{id:1,type:'Verse',repeat:rep,squares:[
   {id:1,repeat:1,events:[{chord:'Am',span:4},{chord:'C',span:4},{chord:'F',span:4},{chord:'G',span:4}]},
   n?{id:2,repeat:1,events:[{chord:'Dm',span:8}]}:{id:2,repeat:1,events:[{chord:'Dm',span:16}]}]}];
  nextId=9;squareZoom=1;applySquareZoom(true);requestRender();},narrow,repeat);
 await new Promise(r=>setTimeout(r,600));};

const probe=async(z,frac,sel)=>{
 await p.evaluate((v,f)=>{setSquareZoom(v);applySquareZoom(true);
  const vp=document.querySelector('.squares-viewport');
  vp.scrollLeft=Math.round((vp.scrollWidth-vp.clientWidth)*f);},z,frac);
 await new Promise(r=>setTimeout(r,260));
 return p.evaluate((s)=>{const vp=document.querySelector('.squares-viewport');
  const bA=document.querySelector(s);
  const sq=[...document.querySelectorAll('.square-inner')].pop();
  const R=e=>{const r=e.getBoundingClientRect();return{l:Math.round(r.left),r:Math.round(r.right),t:Math.round(r.top),b:Math.round(r.bottom)}};
  const v=R(vp),bb=R(bA),sr=R(sq);
  const el=document.elementFromPoint((bb.l+bb.r)/2,(bb.t+bb.b)/2);
  // Обрезка возможна ТОЛЬКО когда у ряда включён overflow, то есть при
  // зуме (body.is-zoomed). При 1× ряд не скролл-контейнер, и бейдж,
  // вынесенный на 8px правее края квадрата, спокойно выходит за кромку
  // .squares-viewport — ровно так же, как кнопки квадрата.
  const zoomed=document.body.classList.contains('is-zoomed');
  return {sqVisible:sr.r>v.l+2&&sr.l<v.r-2,
    badgeVisible:!zoomed||(bb.l>=v.l-1&&bb.r<=v.r+1),
    clickable:!!(el&&String(el.className).includes('repeat-badge')),
    gap:sr.r-bb.r, bb, v};},sel);};

console.log('=== 1. Постоянный бейдж (повтор ×3) ===');
for(const [nm,narrow] of [['узкий последний квадрат',true],['полный последний квадрат',false]]){
 await build(narrow,3);
 let allOk=true,detail='';
 for(const z of [1,2,4,8,16]) for(const f of [0,0.5,1]){
  const d=await probe(z,f,'.section-repeat-badge-absolute');
  const ok=!d.sqVisible||(d.badgeVisible&&d.clickable);
  if(!ok){allOk=false;detail+=` [зум ${z}, прокр ${f*100}%: бейдж ${d.bb.l}..${d.bb.r}, окно ${d.v.l}..${d.v.r}]`;}
 }
 t(`${nm}: бейдж доступен на всех масштабах 1..16×`, allOk, detail);
}
await build(true,3);
const at1=await probe(1,0,'.section-repeat-badge-absolute');
// gap = край квадрата минус правый край бейджа. Бейдж вынесен на 8px
// ПРАВЕЕ края, поэтому здесь ожидается отрицательная величина.
t('при 1× бейдж вынесен правее края квадрата на ~8px',
  at1.gap<=-6 && at1.gap>=-16, `выступ ${-at1.gap}px`);

console.log('\n=== 2. Бейдж по наведению (повтор ×1) ===');
// Раньше он был absolute у края СЕКЦИИ: при коротком последнем квадрате
// висел в пустоте, оторванный от аккордов (замер: разрыв 342px).
await build(true,1);
await p.evaluate(()=>{const s=document.createElement('style');s.id='force';
 s.textContent='.section-repeat-badge-hover{visibility:visible!important;pointer-events:auto!important}';
 document.head.appendChild(s);});
await new Promise(r=>setTimeout(r,300));
const near=await probe(1,0,'.section-repeat-badge-hover');
t('«×1» стоит у края СВОЕГО квадрата, а не секции', near.gap<=-6 && near.gap>=-16,
  `выступ ${-near.gap}px`);
let hOk=true,hDet='';
for(const z of [1,2,4,8,16]) for(const f of [0,0.5,1]){
 const d=await probe(z,f,'.section-repeat-badge-hover');
 const ok=!d.sqVisible||(d.badgeVisible&&d.clickable);
 if(!ok){hOk=false;hDet+=` [зум ${z}, прокр ${f*100}%: ${d.bb.l}..${d.bb.r} в окне ${d.v.l}..${d.v.r}]`;}
}
t('«×1» доступен на всех масштабах 1..16×', hOk, hDet);
await p.evaluate(()=>{setSquareZoom(1);applySquareZoom(true)});
await new Promise(r=>setTimeout(r,300));
await p.evaluate(()=>document.getElementById('force')?.remove());

console.log('\n=== 3. Высота секции: «×1» её не меняет ===');
// Обёртка под всплывающий бейдж нулевой высоты — иначе появление «×1»
// сдвигало бы ячейки из-под курсора.
await build(true,1);
await p.mouse.move(0,0);
await new Promise(r=>setTimeout(r,300));
const hRest=await p.evaluate(()=>Math.round(document.querySelector('.section-card').getBoundingClientRect().height));
const rowH=await p.evaluate(()=>Math.round(document.querySelector('.section-repeat-row--hover').getBoundingClientRect().height));
t('строка под «×1» нулевой высоты', rowH===0, `${rowH}px`);
const vis=await p.evaluate(()=>getComputedStyle(document.querySelector('.section-repeat-badge-hover')).visibility);
t('бейдж «×1» скрыт до наведения', vis==='hidden', vis);
// Секция без повтора не должна быть выше, чем была до появления обёртки.
await build(false,1);
const hFull=await p.evaluate(()=>Math.round(document.querySelector('.section-card').getBoundingClientRect().height));
t('секция без повтора не выросла', hFull<=190, `${hFull}px`);
await build(true,1);
await p.hover('.section-card');
await new Promise(r=>setTimeout(r,350));
const vis2=await p.evaluate(()=>getComputedStyle(document.querySelector('.section-repeat-badge-hover')).visibility);
t('бейдж «×1» показывается при наведении', vis2==='visible', vis2);
const geom=await p.evaluate(()=>{
  const R=e=>{const r=e.getBoundingClientRect();return{t:Math.round(r.top),b:Math.round(r.bottom),l:Math.round(r.left),r:Math.round(r.right)}};
  const sq=[...document.querySelectorAll('.square-inner')].pop();
  const bh=document.querySelector('.section-repeat-badge-hover');
  const add=document.querySelector('.add-square-btn');
  const bb=R(bh),sr=R(sq),ar=R(add);
  const elAdd=document.elementFromPoint((ar.l+ar.r)/2,(ar.t+ar.b)/2);
  return {below:bb.t>=sr.b-1, overlapAdd:!(bb.r<ar.l||bb.l>ar.r||bb.b<ar.t||bb.t>ar.b),
    addReachable:!!(elAdd&&(elAdd.closest?.('.add-square-btn')))};});
t('«×1» свисает ПОД квадрат, а не налезает на ячейку', geom.below);
t('«×1» не перекрывает кнопку «+»', !geom.overlapAdd && geom.addReachable);
// Вынос вправо не должен доводить бейдж до колонки кнопок квадрата
// (✕, ×N, «N тактов») — иначе они бы перекрывались.
const cols=await p.evaluate(()=>{
  const R=e=>{const r=e.getBoundingClientRect();return{l:r.left,r:r.right,t:r.top,b:r.bottom}};
  const bb=R(document.querySelector('.section-repeat-badge-hover'));
  return [...document.querySelectorAll('.del-square-btn,.square-beats-badge,.repeat-badge')]
    .map(R).some(c=>!(bb.r<c.l||bb.l>c.r||bb.b<c.t||bb.t>c.b));});
t('бейдж не задевает колонку кнопок квадрата', !cols);
// Прибавка высоты при наведении бывает и без бейджа (кнопки «+» и
// «клонировать» появляются по hover) — важно, что бейдж своего не добавил.
await p.evaluate(()=>{document.querySelectorAll('.section-repeat-row--hover').forEach(e=>e.style.display='none')});
await p.mouse.move(0,0);await new Promise(r=>setTimeout(r,300));
const hNoRow=await p.evaluate(()=>Math.round(document.querySelector('.section-card').getBoundingClientRect().height));
t('высота секции та же, что и совсем без строки бейджа', hNoRow===hRest,
  `${hNoRow} против ${hRest}px`);
await p.evaluate(()=>{document.querySelectorAll('.section-repeat-row--hover').forEach(e=>e.style.display='')});

console.log('\n=== 5. Свисающий бейдж не создаёт вертикальной прокрутки ===');
// Он выходит за нижнюю кромку ряда; без поля снизу у .squares-viewport
// появлялась лишняя вертикальная полоса (замер: 167 против 148).
let vbad='';
for(const [nm,narrow] of [['узкий',true],['полный',false]]){
 await build(narrow,1);
 for(const z of [1,2,4,8]){
  await p.evaluate(v=>{setSquareZoom(v);applySquareZoom(true)},z);
  await new Promise(r=>setTimeout(r,300));
  const d=await p.evaluate(()=>{const vp=document.querySelector('.squares-viewport');
    return {vert:vp.scrollHeight>vp.clientHeight+1,sh:vp.scrollHeight,ch:vp.clientHeight};});
  if(d.vert)vbad+=` [${nm} зум ${z}: ${d.sh} против ${d.ch}]`;
 }
}
t('вертикальной прокрутки ряда нет ни на одном масштабе', !vbad, vbad);
// И сам бейдж при этом не обрезается нижней кромкой.
await build(true,1);
await p.evaluate(()=>{const s=document.createElement('style');s.id='force2';
 s.textContent='.section-repeat-badge-hover{visibility:visible!important;pointer-events:auto!important}';
 document.head.appendChild(s);});
await p.evaluate(()=>{setSquareZoom(4);applySquareZoom(true)});
await new Promise(r=>setTimeout(r,350));
const clip=await p.evaluate(()=>{const vp=document.querySelector('.squares-viewport').getBoundingClientRect();
 const bb=document.querySelector('.section-repeat-badge-hover').getBoundingClientRect();
 return {clipped:bb.bottom>vp.bottom+1,badgeB:Math.round(bb.bottom),vpB:Math.round(vp.bottom)};});
t('бейдж не обрезается нижней кромкой при зуме', !clip.clipped,
  `низ бейджа ${clip.badgeB}, кромка ${clip.vpB}`);
await p.evaluate(()=>document.getElementById('force2')?.remove());

console.log('\n=== 4. Клик по бейджу работает при зуме ===');
await build(true,3);
await p.evaluate(()=>{setSquareZoom(8);applySquareZoom(true)});
await new Promise(r=>setTimeout(r,400));
await p.evaluate(()=>{window.__asked=null;window.prompt=(q,d)=>{window.__asked=d;return '5';}});
await p.click('.section-repeat-badge-absolute');
await new Promise(r=>setTimeout(r,500));
const after=await p.evaluate(()=>({asked:window.__asked,rep:sections[0].repeat,
  txt:document.querySelector('.section-repeat-badge-absolute')?.textContent.trim()}));
t('клик открыл запрос с текущим значением', after.asked==='3', String(after.asked));
t('повтор изменился на 5', after.rep===5, String(after.rep));
t('бейдж перерисован', after.txt==='×5', after.txt);

t('ошибок страницы нет', errs.length===0, errs.join('; '));
console.log(bad?`\nПРОВАЛЕНО: ${bad}`:'\nвсё зелено');
await b.close();process.exit(bad?1:0);})();

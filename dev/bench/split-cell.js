// Деление ячейки кнопкой «+»: дробные длительности.
//
// Раньше стоял запрет «нельзя разделить ячейку длительностью 1» —
// техническая страховка при целочисленном Math.floor(cs / 2), который
// на span=1 давал 0. Музыкального смысла в запрете не было: модель
// дробные доли держит давно (растяжка ручкой при зуме даёт восьмые и
// шестнадцатые), а затакты в пол-доли встречаются в реальных песнях.
const puppeteer=require('/home/user/node_modules/puppeteer');
let bad=0;
const t=(n,c,x='')=>{if(c)console.log('   ok  ',n,x);else{bad++;console.log('  FAIL ',n,x)}};
(async()=>{
const b=await puppeteer.launch({args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
const p=await b.newPage();await p.setViewport({width:1440,height:900});
const errs=[];p.on('pageerror',e=>errs.push(e.message));
const toasts=[];await p.exposeFunction('__t',x=>toasts.push(x));
await p.evaluateOnNewDocument(()=>{window.__ev=[];
  const AC=window.AudioContext||window.webkitAudioContext;
  const w=o=>function(){const n=o.call(this);const s=n.start.bind(n);const c=this;
    n.start=function(x){window.__ev.push(+((x||0)-c.currentTime).toFixed(4));return s(x)};return n};
  AC.prototype.createBufferSource=w(AC.prototype.createBufferSource);
  AC.prototype.createOscillator=w(AC.prototype.createOscillator);});
await p.goto('file:///home/user/STRUCHORD.html',{waitUntil:'networkidle0'});
await p.evaluate(()=>{const o=window.showToast;window.showToast=function(x){window.__t(x);return o.apply(this,arguments)}});
await new Promise(r=>setTimeout(r,900));
const song=()=>p.evaluate(()=>{sections=[{id:1,type:'Verse',repeat:1,squares:[{id:1,repeat:1,events:[
  {chord:'Am',span:4},{chord:'C',span:4},{chord:'F',span:4},{chord:'G',span:4}]}]}];
  nextId=9;requestRender()});
await song();await new Promise(r=>setTimeout(r,700));

console.log('=== 1. Деление до дробных долей ===');
const total0=await p.evaluate(()=>getSquareBeats(sections[0].squares[0],globalTimeSig));
const seq=[];
for(let i=0;i<6;i++){
  await p.evaluate(()=>addChordAfter(1,1,0));
  await new Promise(r=>setTimeout(r,220));
  seq.push(await p.evaluate(()=>sections[0].squares[0].events[0].span));
}
t('span=1 делится пополам', seq.includes(0.5), 'ряд: '+seq.join(' → '));
t('деление доходит до 1/16', seq.includes(0.0625), 'минимум '+Math.min(...seq));
const total1=await p.evaluate(()=>getSquareBeats(sections[0].squares[0],globalTimeSig));
t('сумма долей квадрата не изменилась', Math.abs(total1-total0)<1e-9, `${total0} -> ${total1}`);

console.log('\n=== 2. Предел ===');
toasts.length=0;
const before=await p.evaluate(()=>sections[0].squares[0].events.length);
await p.evaluate(()=>addChordAfter(1,1,0));
await new Promise(r=>setTimeout(r,300));
t('ниже 1/16 не делит', await p.evaluate(()=>sections[0].squares[0].events.length)===before);
t('сообщает понятно', toasts.some(x=>/минималь/.test(x)), toasts.join(' | '));

console.log('\n=== 3. Звук и сетка ===');
await song();await new Promise(r=>setTimeout(r,600));
await p.evaluate(()=>{addChordAfter(1,1,0);});await new Promise(r=>setTimeout(r,250));
await p.evaluate(()=>{addChordAfter(1,1,0);});await new Promise(r=>setTimeout(r,250));
await p.evaluate(()=>{addChordAfter(1,1,0);});await new Promise(r=>setTimeout(r,250));
await p.evaluate(()=>{const e=sections[0].squares[0].events;
  e[0].chord='Bm';e[1].chord='E';requestRender()});
await new Promise(r=>setTimeout(r,600));
const spans=await p.evaluate(()=>sections[0].squares[0].events.map(e=>e.span));
t('в квадрате есть дробные доли', spans.some(v=>v%1!==0), spans.join(', '));
await p.evaluate(()=>{window.__ev=[];playAll()});
await new Promise(r=>setTimeout(r,5000));
const ev=await p.evaluate(()=>window.__ev.slice());
await p.evaluate(()=>{if(playbackState.isPlaying)playAll()});
t('звук идёт', ev.length>0, ev.length+' источников');
t('нет опоздавших событий', ev.filter(x=>x<0).length===0, `опоздавших ${ev.filter(x=>x<0).length}`);

console.log('\n=== 4. Лента ===');
await p.evaluate(()=>toggleTimelineMode());await new Promise(r=>setTimeout(r,900));
const tl=await p.evaluate(()=>{
  const cells=[...document.querySelectorAll('.tl-cell')];
  const w=cells.map(c=>c.offsetWidth);
  const counts=[...document.querySelectorAll('.tl-count')].map(e=>e.textContent);
  return {n:cells.length, w, counts:counts.slice(0,8)};
});
t('лента построена', tl.n===spans.length, `${tl.n} ячеек при ${spans.length} событиях`);
t('ширины пропорциональны долям',
  Math.abs(tl.w[2]/tl.w[0]-spans[2]/spans[0])<0.3, `${tl.w.slice(0,3).join(', ')} при ${spans.slice(0,3).join(', ')}`);
t('счёт долей на месте', tl.counts.length>0, tl.counts.join(' '));

console.log('\n=== 5. Сохранение ===');
const round=await p.evaluate(()=>{
  const json=JSON.stringify({sections});
  return JSON.parse(json).sections[0].squares[0].events.map(e=>e.span);
});
t('дробь переживает JSON', JSON.stringify(round)===JSON.stringify(spans), round.join(', '));

t('ошибок JS нет', errs.length===0, errs.slice(0,2).join(' | '));
console.log(bad?`\n  ПРОВАЛОВ: ${bad}`:'\n  всё зелено');
await b.close();process.exit(bad?1:0);
})();

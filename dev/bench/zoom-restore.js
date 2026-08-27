// Автозум действует ТОЛЬКО на время воспроизведения.
//
// При старте ▶ масштаб подбирается под самую мелкую долю
// (autoZoomForPlayback), при остановке — возвращается тот, что человек
// выставил до старта. Раньше расчётный масштаб оставался навсегда:
// замер давал 374% после остановки при 260% до неё.
//
// Исключение: если человек крутил зум ПОКА ИГРАЛО, текущее значение
// выбрал он сам — подменять его старым нельзя.
const puppeteer=require('/home/user/node_modules/puppeteer');
let bad=0;
const t=(n,c,x='')=>{if(c)console.log('   ok  ',n,x);else{bad++;console.log('  FAIL ',n,x)}};
(async()=>{
const b=await puppeteer.launch({args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
const p=await b.newPage();await p.setViewport({width:1400,height:900});
const errs=[];p.on('pageerror',e=>errs.push(String(e).split('\n')[0]));
await p.goto('file:///home/user/STRUCHORD.html',{waitUntil:'networkidle0'});
await new Promise(r=>setTimeout(r,900));

// Песня с шестнадцатой — автозум заведомо сработает.
const song=async()=>{await p.evaluate(()=>{sections=[{id:1,type:'Verse',repeat:1,squares:[
 {id:1,repeat:1,events:[{chord:'Am',span:0.25},{chord:'C',span:3.75},
  {chord:'F',span:4},{chord:'G',span:4},{chord:'Dm',span:4}]}]}];
 nextId=9;squareZoom=1;applySquareZoom(true);requestRender();});
 await new Promise(r=>setTimeout(r,600));};
const st=()=>p.evaluate(()=>({zoom:+squareZoom.toFixed(3),
 zoomed:document.body.classList.contains('is-zoomed'),
 badge:!!document.querySelector('.section-badge--zoom'),
 playing:playbackState.isPlaying,
 width:Math.round(document.querySelector('.squares-list').getBoundingClientRect().width)}));
const play=async()=>{await p.evaluate(()=>playAll());await new Promise(r=>setTimeout(r,1100));};
const stop=async()=>{await p.evaluate(()=>stopPlayback());await new Promise(r=>setTimeout(r,700));};

console.log('=== 1. Свой масштаб возвращается ===');
await song();
await p.evaluate(()=>{setSquareZoom(2.6,true)});await new Promise(r=>setTimeout(r,400));
const s1=await st();
await play();const s2=await st();
await stop();const s3=await st();
console.log(`      ${s1.zoom}× -> игра ${s2.zoom}× -> стоп ${s3.zoom}×`);
t('до игры масштаб свой', Math.abs(s1.zoom-2.6)<0.01, `${s1.zoom}×`);
t('автозум поднял масштаб на время игры', s2.zoom>s1.zoom+0.5, `${s2.zoom}×`);
t('после остановки вернулся свой', Math.abs(s3.zoom-2.6)<0.02, `${s3.zoom}×`);
t('ширина ряда тоже вернулась', Math.abs(s3.width-s1.width)<=2, `${s1.width} -> ${s3.width}px`);

console.log('\n=== 2. Масштаб 1× — возвращается 1× ===');
await p.evaluate(()=>{resetSquareZoom()});await new Promise(r=>setTimeout(r,500));
const a1=await st();
await play();const a2=await st();
await stop();const a3=await st();
console.log(`      ${a1.zoom}× -> игра ${a2.zoom}× -> стоп ${a3.zoom}×`);
t('автозум сработал', a2.zoom>1.5, `${a2.zoom}×`);
t('вернулся ровно 1×', Math.abs(a3.zoom-1)<0.02, `${a3.zoom}×`);
t('класс is-zoomed снят', !a3.zoomed);
t('бейдж масштаба убран', !a3.badge);

console.log('\n=== 3. Зум, выкрученный ВО ВРЕМЯ игры, не отменяется ===');
await p.evaluate(()=>{setSquareZoom(2,true)});await new Promise(r=>setTimeout(r,400));
await play();
await p.evaluate(()=>{setSquareZoom(6,true)});await new Promise(r=>setTimeout(r,400));
const m1=await st();
await stop();const m2=await st();
console.log(`      во время игры выставил ${m1.zoom}× -> после стопа ${m2.zoom}×`);
t('масштаб, выбранный при игре, сохранён', Math.abs(m2.zoom-6)<0.02, `${m2.zoom}×`);

console.log('\n=== 4. Повторный цикл играть/стоп ===');
await p.evaluate(()=>{setSquareZoom(1.8,true)});await new Promise(r=>setTimeout(r,400));
let okCycle=true,det='';
for(let i=1;i<=3;i++){
 await play();const d1=await st();
 await stop();const d2=await st();
 if(Math.abs(d2.zoom-1.8)>0.02){okCycle=false;det+=` [круг ${i}: ${d2.zoom}×]`;}
 if(!(d1.zoom>1.8)){okCycle=false;det+=` [круг ${i}: автозум не сработал]`;}
}
t('три цикла подряд возвращают тот же масштаб', okCycle, det||'1.8× каждый раз');

console.log('\n=== 5. Песня из четвертей: автозум опускает к 100%, стоп возвращает своё ===');
await p.evaluate(()=>{sections=[{id:1,type:'Verse',repeat:1,squares:[
 {id:1,repeat:1,events:[{chord:'Am',span:4},{chord:'C',span:4},{chord:'F',span:4},{chord:'G',span:4}]}]}];
 nextId=9;setSquareZoom(2.2,true);requestRender();});
await new Promise(r=>setTimeout(r,600));
const q1=await st();
await play();const q2=await st();
await stop();const q3=await st();
console.log(`      ${q1.zoom}× -> игра ${q2.zoom}× -> стоп ${q3.zoom}×`);
// Автозум для песни без мелких долей даёт ровно 100% — это его штатное
// поведение («обзор всей песни»), а не дефект. Важно, что после
// остановки человеку возвращается ЕГО масштаб.
t('на время игры масштаб приведён к 100%', Math.abs(q2.zoom-1)<0.02, `${q2.zoom}×`);
t('после остановки вернулся свой 2.2×', Math.abs(q3.zoom-2.2)<0.02, `${q3.zoom}×`);

console.log('\n=== 6. Остановка кнопкой ▶ (повторное нажатие) ===');
await p.evaluate(()=>{sections[0].squares[0].events=[{chord:'Am',span:0.25},{chord:'C',span:3.75},
 {chord:'F',span:4},{chord:'G',span:4}];setSquareZoom(1.5,true);requestRender();});
await new Promise(r=>setTimeout(r,600));
await play();const b2=await st();
await p.evaluate(()=>playAll());await new Promise(r=>setTimeout(r,700));
const b3=await st();
console.log(`      игра ${b2.zoom}× -> ▶ ещё раз ${b3.zoom}×`);
t('повторное ▶ остановило', !b3.playing);
t('и вернуло масштаб', Math.abs(b3.zoom-1.5)<0.02, `${b3.zoom}×`);

t('ошибок страницы нет', errs.length===0, errs.join('; '));
console.log(bad?`\nПРОВАЛЕНО: ${bad}`:'\nвсё зелено');
await b.close();process.exit(bad?1:0);})();

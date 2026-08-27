// Автозум при старте воспроизведения (вариант А: честные пропорции).
//
// Масштаб подбирается так, чтобы САМАЯ МЕЛКАЯ ячейка песни стала не уже
// 44px. Пропорции сохраняются полностью — шестнадцатая остаётся вчетверо
// короче четверти, просто всё крупнее. Ряд шире экрана и прокручивается.
//
// Режим ленты не затрагивается: там свой масштаб по темпу и ручная
// регулировка кнопками «− авто +».
const puppeteer=require('/home/user/node_modules/puppeteer');
let bad=0;
const t=(n,c,x='')=>{if(c)console.log('   ok  ',n,x);else{bad++;console.log('  FAIL ',n,x)}};
(async()=>{
const b=await puppeteer.launch({args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
const p=await b.newPage();await p.setViewport({width:1440,height:900});
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('file:///home/user/STRUCHORD.html',{waitUntil:'networkidle0'});
await new Promise(r=>setTimeout(r,900));

const play=async(events)=>{
  await p.evaluate(ev=>{
    sections=[{id:1,type:'Verse',repeat:1,squares:[{id:1,repeat:1,events:ev}]}];
    nextId=9;squareZoom=1;applySquareZoom(true);requestRender();
  },events);
  await new Promise(r=>setTimeout(r,600));
  await p.evaluate(()=>playAll());
  await new Promise(r=>setTimeout(r,900));
  const d=await p.evaluate(()=>{
    const w=[...document.querySelectorAll('.chord-wrapper')].map(e=>e.getBoundingClientRect().width);
    const vp=document.querySelector('.squares-viewport');
    return {zoom:squareZoom, min:Math.min(...w), playing:playbackState.isPlaying,
      scrolls:vp.scrollWidth>vp.clientWidth+1};
  });
  await p.evaluate(()=>{if(playbackState.isPlaying)playAll()});
  await new Promise(r=>setTimeout(r,350));
  return d;
};

console.log('=== 1. Масштаб по самой мелкой доле ===');
const q=await play([{chord:'Am',span:4},{chord:'C',span:4},{chord:'F',span:4},{chord:'G',span:4}]);
t('песня из четвертей — масштаб не трогаем', Math.abs(q.zoom-1)<0.01, `${q.zoom.toFixed(2)}×`);

for(const [label,small,rest] of [['1/2',0.5,3.5],['1/4',0.25,3.75],['1/16',0.0625,3.9375]]){
  const d=await play([{chord:'Am',span:small},{chord:'C',span:rest},
    {chord:'F',span:4},{chord:'G',span:4}]);
  t(`есть ${label}: мелкая ячейка читаема`, d.min>=43,
    `зум ${d.zoom.toFixed(2)}×, ячейка ${Math.round(d.min)}px`);
  t(`есть ${label}: воспроизведение идёт`, d.playing);
}

console.log('\n=== 2. Пропорции честные ===');
const prop=await play([{chord:'Am',span:0.5},{chord:'C',span:1},{chord:'F',span:2},{chord:'G',span:4}]);
const ratio=await p.evaluate(()=>{
  const w=[...document.querySelectorAll('.chord-wrapper')].map(e=>e.getBoundingClientRect().width);
  return {half:w[0], one:w[1], two:w[2]};
});
t('доля 1 вдвое шире доли 1/2', Math.abs(ratio.one/ratio.half-2)<0.25,
  `${Math.round(ratio.half)} → ${Math.round(ratio.one)} → ${Math.round(ratio.two)}px`);
t('доля 2 вдвое шире доли 1', Math.abs(ratio.two/ratio.one-2)<0.25);

console.log('\n=== 3. Прокрутка вместо сжатия ===');
t('ряд шире экрана — есть прокрутка', prop.scrolls);

console.log('\n=== 4. Лента не затронута ===');
const jj=require('fs').readFileSync('/home/user/dev/fixtures/wind-of-change.json','utf8');
await p.evaluate(x=>{const f=new File([new Blob([x])],'s.json');window.importSong(f)},jj);
await new Promise(r=>setTimeout(r,900));
await p.evaluate(()=>toggleTimelineMode());
await new Promise(r=>setTimeout(r,900));
const tl0=await p.evaluate(()=>timelineZoom);
await p.evaluate(()=>playAll());
await new Promise(r=>setTimeout(r,1200));
const tl1=await p.evaluate(()=>({tl:timelineZoom,playing:playbackState.isPlaying}));
await p.evaluate(()=>{if(playbackState.isPlaying)playAll()});
t('зум ленты не изменился', tl0===tl1.tl, `${tl0} -> ${tl1.tl}`);
t('лента играет', tl1.playing);

console.log('\n=== 5. Ручной зум после старта ===');
await p.evaluate(()=>toggleTimelineMode());
await new Promise(r=>setTimeout(r,700));
await p.evaluate(()=>setSquareZoom(2.2,true));
await new Promise(r=>setTimeout(r,300));
t('пользователь может менять масштаб',
  Math.abs(await p.evaluate(()=>squareZoom)-2.2)<0.01);

t('ошибок JS нет', errs.length===0, errs.slice(0,2).join(' | '));
console.log(bad?`\n  ПРОВАЛОВ: ${bad}`:'\n  всё зелено');
await b.close();process.exit(bad?1:0);
})();

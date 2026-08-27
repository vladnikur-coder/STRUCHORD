// Вторая ручка — изменение длины всего квадрата (square-resize-handle),
// плюс связка: зум во время/после ресайза, повторный рендер.
const puppeteer=require('puppeteer');
(async()=>{
  const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-dev-shm-usage']});
  const p=await b.newPage();
  await p.setViewport({width:1400,height:800});
  const errs=[]; p.on('pageerror',e=>errs.push(String(e).split('\n')[0]));
  await p.goto('file:///home/user/STRUCHORD.html',{waitUntil:'load'});
  await new Promise(r=>setTimeout(r,900));
  let fails=0;
  const ok=(c,l,x)=>{console.log(`${c?'ok    ':'ПЛОХО '} ${l}`);if(!c){fails++;if(x)console.log('         '+x);}};

  // Второй квадрат длиной 8 тактов задаёт запас: getSectionMaxBeats берёт
  // максимум по секции, и при единственном квадрате максимум равен его же
  // длине — тянуть было бы некуда, и тест проверял бы невозможное.
  const setup=async(z)=>{
    await p.evaluate((zz)=>{
      sections=[]; globalTimeSig='4/4'; addSection('Verse');
      const sec=sections[0];
      sec.squares[0].events=[{chord:'Am',span:4},{chord:'F',span:4},
        {chord:'C',span:4},{chord:'G',span:4}];
      sec.squares[0].customBeats=16;
      addSquare(sec.id);
      sec.squares[1].customBeats=32;
      sec.squares[1].events=[{chord:'X',span:32}];
      setSquareZoom(1); render(); setSquareZoom(zz); render();
    },z);
    await new Promise(r=>setTimeout(r,350));
  };
  const state=()=>p.evaluate(()=>{
    const sq=sections[0].squares[0];
    return {spans:sq.events.map(e=>e.span),beats:getSquareBeats(sq,'4/4'),
            custom:sq.customBeats};
  });
  const dragSquare=async(dx)=>{
    await p.evaluate(()=>{const h=document.querySelector('.square-resize-handle');
      if(h) h.scrollIntoView({block:'nearest',inline:'center'});});
    await new Promise(r=>setTimeout(r,200));
    const h=await p.$('.square-resize-handle');
    if(!h) return 'нет ручки квадрата';
    const box=await h.boundingBox();
    if(!box) return 'ручка квадрата не видна';
    const vp=p.viewport();
    if(box.x<2||box.x>vp.width-2) return `ручка вне окна x=${Math.round(box.x)}`;
    const x=box.x+box.width/2,y=box.y+box.height/2;
    await p.mouse.move(x,y); await p.mouse.down();
    const st=Math.max(6,Math.min(30,Math.abs(Math.round(dx/5))));
    for(let i=1;i<=st;i++){await p.mouse.move(x+dx*i/st,y);await new Promise(r=>setTimeout(r,8));}
    await new Promise(r=>setTimeout(r,60));
    await p.mouse.up(); await new Promise(r=>setTimeout(r,400));
    return null;
  };

  console.log('=== 1. Изменение длины квадрата при 1× ===');
  await setup(1);
  let s0=await state();
  const beatPx1=await p.evaluate(()=>document.querySelector('.square-inner').getBoundingClientRect().width/16);
  let err=await dragSquare(Math.round(beatPx1*4));   // +1 такт
  let s1=await state();
  console.log(`   ${err||''} было ${s0.beats} долей -> стало ${s1.beats}`);
  ok(!err && s1.beats>s0.beats,'квадрат удлинился',err||`${s0.beats}->${s1.beats}`);

  console.log('\n=== 2. То же при 2.5× ===');
  await setup(2.5);
  s0=await state();
  const beatPx2=await p.evaluate(()=>document.querySelector('.square-inner').getBoundingClientRect().width/16);
  err=await dragSquare(Math.round(beatPx2*4));
  s1=await state();
  console.log(`   ${err||''} было ${s0.beats} -> стало ${s1.beats} (такты кратны 4)`);
  ok(!err && s1.beats>s0.beats,'при зуме квадрат тоже удлиняется',err||`${s0.beats}->${s1.beats}`);
  ok(s1.beats%4===0,'длина осталась кратной такту',s1.beats+'');

  console.log('\n=== 3. Зум ПОСЛЕ ресайза не портит результат ===');
  await setup(2.5);
  const bp=await p.evaluate(()=>document.querySelector('.square-inner').getBoundingClientRect().width/16);
  // сдвигаем первую границу
  await p.evaluate(()=>{const h=document.querySelector('.resize-handle');h.scrollIntoView({inline:'center'});});
  await new Promise(r=>setTimeout(r,180));
  {
    const h=await p.$('.resize-handle'); const box=await h.boundingBox();
    const x=box.x+box.width/2,y=box.y+box.height/2;
    await p.mouse.move(x,y);await p.mouse.down();
    for(let i=1;i<=8;i++){await p.mouse.move(x+Math.round(bp*0.25)*i/8,y);await new Promise(r=>setTimeout(r,8));}
    await p.mouse.up(); await new Promise(r=>setTimeout(r,320));
  }
  const afterResize=await state();
  console.log(`   после ресайза: ${JSON.stringify(afterResize.spans)}`);
  for(const z of [1,4,2,1]){
    await p.evaluate((zz)=>setSquareZoom(zz),z);
    await new Promise(r=>setTimeout(r,220));
  }
  const afterZoom=await state();
  console.log(`   после зумов 1x->4x->2x->1x: ${JSON.stringify(afterZoom.spans)}`);
  ok(JSON.stringify(afterResize.spans)===JSON.stringify(afterZoom.spans),
     'зум не меняет длительности',`${JSON.stringify(afterResize.spans)} vs ${JSON.stringify(afterZoom.spans)}`);
  ok(Math.abs(afterZoom.beats-16)<1e-6,'длина квадрата не уплыла',afterZoom.beats+'');

  console.log('\n=== 4. Ресайз -> перерисовка -> ресайз ===');
  await setup(2.5);
  const bp4=await p.evaluate(()=>document.querySelector('.square-inner').getBoundingClientRect().width/16);
  for(let round=0;round<3;round++){
    await p.evaluate(()=>{const h=document.querySelector('.resize-handle');h.scrollIntoView({inline:'center'});});
    await new Promise(r=>setTimeout(r,150));
    const h=await p.$('.resize-handle'); const box=await h.boundingBox();
    const x=box.x+box.width/2,y=box.y+box.height/2;
    await p.mouse.move(x,y);await p.mouse.down();
    for(let i=1;i<=8;i++){await p.mouse.move(x+Math.round(bp4*0.25)*i/8,y);await new Promise(r=>setTimeout(r,8));}
    await p.mouse.up(); await new Promise(r=>setTimeout(r,280));
    await p.evaluate(()=>render());
    await new Promise(r=>setTimeout(r,200));
  }
  const s4=await state();
  console.log(`   ${JSON.stringify(s4.spans)}, длина ${s4.beats}`);
  ok(Math.abs(s4.beats-16)<1e-6,'после трёх циклов длина = 16',s4.beats+'');
  ok(Math.abs(s4.spans[0]-4.75)<1e-6,'три шага по 0.25 дали 4.75',s4.spans[0]+'');

  console.log(fails?`\nПРОБЛЕМ: ${fails}`:'\nвсё прошло');
  if(errs.length) console.log('ОШИБКИ:',errs.slice(0,5));
  await b.close();
  process.exitCode=fails?1:0;
})();

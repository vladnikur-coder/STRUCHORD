// Тяжёлые случаи: составные размеры, свой timeSig у ячейки, серии
// протяжек подряд, границы диапазона, все шаги зума.
const puppeteer=require('puppeteer');
(async()=>{
  const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-dev-shm-usage']});
  const p=await b.newPage();
  await p.setViewport({width:1400,height:800});
  const errs=[]; p.on('pageerror',e=>errs.push(String(e).split('\n')[0]));
  await p.goto('file:///home/user/STRUCHORD.html',{waitUntil:'load'});
  await new Promise(r=>setTimeout(r,900));
  let fails=0;
  const ok=(c,label,extra)=>{console.log(`${c?'ok    ':'ПЛОХО '} ${label}`);
    if(!c){fails++; if(extra) console.log('         '+extra);}};

  const setup=async(zoom,ts,events)=>{
    await p.evaluate((z,t,ev)=>{
      sections=[]; globalTimeSig=t; addSection('Verse');
      sections[0].squares[0].events=ev.map(e=>({chord:e.c,span:e.s,timeSig:e.ts||null}));
      sections[0].squares[0].customBeats=null;
      setSquareZoom(1); render(); setSquareZoom(z); render();
    },zoom,ts,events);
    await new Promise(r=>setTimeout(r,320));
  };
  const spans=()=>p.evaluate(()=>sections[0].squares[0].events.map(e=>e.span));
  const totalBeats=()=>p.evaluate(()=>{
    const s=sections[0], sq=s.squares[0], ts=s.timeSig||globalTimeSig;
    return +sq.events.reduce((a,ev)=>a+getEventVisualSpanInParentUnits(ev,ts),0).toFixed(4);
  });
  const dragNth=async(n,dx)=>{
    await p.evaluate((i)=>{const h=document.querySelectorAll('.resize-handle')[i];
      if(h) h.scrollIntoView({block:'nearest',inline:'center'});},n);
    await new Promise(r=>setTimeout(r,200));
    const hs=await p.$$('.resize-handle');
    if(!hs[n]) return false;
    const box=await hs[n].boundingBox();
    if(!box) return false;
    const x=box.x+box.width/2,y=box.y+box.height/2;
    await p.mouse.move(x,y); await p.mouse.down();
    const steps=Math.max(6,Math.min(30,Math.abs(Math.round(dx/5))));
    for(let i=1;i<=steps;i++){await p.mouse.move(x+dx*i/steps,y);await new Promise(r=>setTimeout(r,8));}
    await new Promise(r=>setTimeout(r,50));
    await p.mouse.up(); await new Promise(r=>setTimeout(r,300));
    return true;
  };
  const beatPx=async()=>{
    const r=await p.evaluate(()=>{
      const s=sections[0],sq=s.squares[0],ts=s.timeSig||globalTimeSig;
      const beats=sq.events.reduce((a,ev)=>a+getEventVisualSpanInParentUnits(ev,ts),0);
      return document.querySelector('.square-inner').getBoundingClientRect().width/beats;
    });
    return r;
  };

  console.log('=== 1. Составной размер 6/8 ===');
  await setup(2.5,'6/8',[{c:'Am',s:3},{c:'F',s:3}]);
  let t0=await totalBeats(); let bp=await beatPx();
  const st1=await p.evaluate(()=>getResizeStep());
  await dragNth(0,Math.round(bp*st1));
  let sp=await spans(), t1=await totalBeats();
  console.log(`   шаг ${st1}, ${JSON.stringify(sp)}, длина ${t0} -> ${t1}`);
  ok(Math.abs(t1-t0)<1e-6,'6/8: длина квадрата сохранена',`${t0} -> ${t1}`);
  ok(Math.abs(sp[0]-(3+st1))<1e-6,'6/8: первая ячейка выросла на шаг',JSON.stringify(sp));

  console.log('\n=== 2. Размер 7/8 ===');
  await setup(2.5,'7/8',[{c:'Am',s:4},{c:'F',s:3}]);
  t0=await totalBeats(); bp=await beatPx();
  const st2=await p.evaluate(()=>getResizeStep());
  await dragNth(0,Math.round(bp*st2));
  sp=await spans(); t1=await totalBeats();
  console.log(`   ${JSON.stringify(sp)}, длина ${t0} -> ${t1}`);
  ok(Math.abs(t1-t0)<1e-6,'7/8: длина сохранена',`${t0} -> ${t1}`);

  console.log('\n=== 3. Своя тактовая у ячейки (8/8 внутри 4/4) ===');
  await setup(2.5,'4/4',[{c:'Am',s:4,ts:'8/8'},{c:'F',s:4},{c:'C',s:4},{c:'G',s:4}]);
  t0=await totalBeats(); bp=await beatPx();
  const before3=await spans();
  await dragNth(0,Math.round(bp*0.5));
  sp=await spans(); t1=await totalBeats();
  console.log(`   ${JSON.stringify(before3)} -> ${JSON.stringify(sp)}, длина ${t0} -> ${t1}`);
  ok(Math.abs(t1-t0)<1e-6,'смешанные размеры: длина сохранена',`${t0} -> ${t1}`);

  console.log('\n=== 4. Серия протяжек подряд (накопление ошибки) ===');
  await setup(2.5,'4/4',[{c:'Am',s:4},{c:'F',s:4},{c:'C',s:4},{c:'G',s:4}]);
  bp=await beatPx();
  const seq=[];
  for(let i=0;i<6;i++){
    await dragNth(0,Math.round(bp*0.25));
    seq.push((await spans())[0]);
  }
  const tEnd=await totalBeats();
  console.log(`   первая ячейка по шагам: ${seq.join(' -> ')}`);
  console.log(`   итоговая длина ${tEnd}`);
  ok(Math.abs(tEnd-16)<1e-6,'после 6 протяжек длина = 16',tEnd+'');
  ok(Math.abs(seq[5]-5.5)<1e-6,'ячейка выросла ровно на 6 шагов (4 -> 5.5)',seq.join(','));

  console.log('\n=== 5. Протяжка в упор влево и вправо ===');
  await setup(2.5,'4/4',[{c:'Am',s:4},{c:'F',s:4},{c:'C',s:4},{c:'G',s:4}]);
  bp=await beatPx();
  await dragNth(0,-2000);
  sp=await spans(); t1=await totalBeats();
  console.log(`   в упор влево: ${JSON.stringify(sp)}, длина ${t1}`);
  ok(Math.abs(t1-16)<1e-6,'упор влево: длина сохранена',t1+'');
  ok(sp[0]>0,'упор влево: ячейка не исчезла',sp[0]+'');
  await setup(2.5,'4/4',[{c:'Am',s:4},{c:'F',s:4},{c:'C',s:4},{c:'G',s:4}]);
  bp=await beatPx();
  await dragNth(0,4000);
  sp=await spans(); t1=await totalBeats();
  console.log(`   в упор вправо: ${JSON.stringify(sp)}, длина ${t1}`);
  ok(Math.abs(t1-16)<1e-6,'упор вправо: длина сохранена',t1+'');
  ok(sp.every(v=>v>0),'упор вправо: соседи не схлопнулись',JSON.stringify(sp));

  console.log('\n=== 6. Все масштабы на дробном квадрате ===');
  for(const z of [1,1.4,1.5,2,2.4,2.5,3,4]){
    await setup(z,'4/4',[{c:'Am',s:0.5},{c:'F',s:3.5},{c:'C',s:4},{c:'G',s:8}]);
    const stp=await p.evaluate(()=>getResizeStep());
    bp=await beatPx();
    const b4=await spans();
    await dragNth(0,Math.round(bp*stp));
    const af=await spans(); const tt=await totalBeats();
    // Ячейка прилипает к сетке шага, а не просто прибавляет его:
    // при шаге 1 доля ячейка 0.5 идёт 0.5 -> 1 -> 2, а не 0.5 -> 1.5.
    // Это правильно — иначе дробные ячейки навсегда оставались бы
    // смещёнными относительно сетки. Проверяем: длина сохранена, ячейка
    // выросла, и результат лежит на сетке шага.
    const onGrid=Math.abs(af[0]/stp-Math.round(af[0]/stp))<1e-9;
    const grew=af[0]>b4[0] && af[0]<=b4[0]+stp+1e-9;
    const good=Math.abs(tt-16)<1e-6 && onGrid && grew;
    console.log(`   ${String(z).padStart(4)}× шаг ${String(stp).padEnd(6)} ${JSON.stringify(b4)} -> ${JSON.stringify(af)} длина ${tt}${good?'':'   <-- ПЛОХО'}`);
    if(!good) fails++;
  }
  ok(true,'(см. строки выше)');

  console.log(fails?`\nПРОБЛЕМ: ${fails}`:'\nвсё прошло');
  if(errs.length) console.log('ОШИБКИ:',errs.slice(0,5));
  await b.close();
  process.exitCode=fails?1:0;
})();

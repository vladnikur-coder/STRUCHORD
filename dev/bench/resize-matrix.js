// Матрица сценариев ресайза при зуме: разные границы, направления,
// длина протяжки, прокрутка ряда, уже дробные ячейки.
const puppeteer=require('puppeteer');
(async()=>{
  const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-dev-shm-usage']});
  const p=await b.newPage();
  await p.setViewport({width:1400,height:800});
  const errs=[]; p.on('pageerror',e=>errs.push(String(e).split('\n')[0]));
  await p.goto('file:///home/user/STRUCHORD.html',{waitUntil:'load'});
  await new Promise(r=>setTimeout(r,900));

  const setup=async(zoom,events,scrollFrac)=>{
    await p.evaluate((z,ev)=>{
      sections=[]; globalTimeSig='4/4'; addSection('Verse');
      sections[0].squares[0].events=ev.map(e=>({chord:e.c,span:e.s}));
      setSquareZoom(1); render(); setSquareZoom(z); render();
    },zoom,events);
    await new Promise(r=>setTimeout(r,300));
    if(scrollFrac){
      await p.evaluate((f)=>{const v=document.querySelector('.squares-viewport');
        v.scrollLeft=(v.scrollWidth-v.clientWidth)*f;},scrollFrac);
      await new Promise(r=>setTimeout(r,200));
    }
  };
  const spans=()=>p.evaluate(()=>sections[0].squares[0].events.map(e=>e.span));
  const innerW=()=>p.evaluate(()=>Math.round(document.querySelector('.square-inner').getBoundingClientRect().width));

  const dragNth=async(n,dx)=>{
    const hs=await p.$$('.resize-handle');
    if(!hs[n]) return 'нет ручки #'+n;
    // При зуме ряд шире экрана, и нужная ручка может быть за краем
    // прокрутки. Настоящий пользователь сначала домотал бы до неё —
    // делаем то же, иначе мышь бьёт мимо и тест врёт о поломке.
    await p.evaluate((i)=>{
      const h=document.querySelectorAll('.resize-handle')[i];
      h.scrollIntoView({block:'nearest',inline:'center'});
    },n);
    await new Promise(r=>setTimeout(r,220));
    const box=await hs[n].boundingBox();
    if(!box) return 'ручка #'+n+' не видна (за краем прокрутки)';
    const vp=p.viewport();
    if(box.x<2||box.x>vp.width-2||box.y<2||box.y>vp.height-2)
      return `ручка #${n} вне окна (x=${Math.round(box.x)})`;
    const x=box.x+box.width/2,y=box.y+box.height/2;
    await p.mouse.move(x,y); await p.mouse.down();
    const steps=Math.max(6,Math.min(30,Math.abs(Math.round(dx/5))));
    for(let i=1;i<=steps;i++){await p.mouse.move(x+dx*i/steps,y);await new Promise(r=>setTimeout(r,8));}
    await new Promise(r=>setTimeout(r,60));
    await p.mouse.up(); await new Promise(r=>setTimeout(r,320));
    return null;
  };

  const four=[{c:'Am',s:4},{c:'F',s:4},{c:'C',s:4},{c:'G',s:4}];
  let fails=0;
  const check=async(label,zoom,events,handle,beats,scrollFrac)=>{
    await setup(zoom,events,scrollFrac);
    const iw=await innerW();
    const beatPx=iw/events.reduce((a,c)=>a+c.s,0);
    const before=await spans();
    const dx=Math.round(beatPx*beats);
    const err=await dragNth(handle,dx);
    const after=await spans();
    const sum=+after.reduce((a,c)=>a+c,0).toFixed(3);
    const want=+(before[handle]+beats).toFixed(3);
    const got=after[handle];
    const okD=Math.abs(got-want)<1e-6, okS=Math.abs(sum-16)<1e-6;
    if(!okD||!okS||err) fails++;
    const mark=(err?'ОШИБКА':(okD&&okS)?'ok':'ПЛОХО');
    console.log(`${mark.padEnd(7)} ${label}`);
    if(err) console.log(`         ${err}`);
    else {
      console.log(`         тянем ручку #${handle} на ${dx>0?'+':''}${dx}px (${beats} доли)`);
      console.log(`         ${JSON.stringify(before)} -> ${JSON.stringify(after)}  сумма ${sum}`);
      if(!okD) console.log(`         !! ячейка ${handle}: ждали ${want}, получили ${got}`);
      if(!okS) console.log(`         !! сумма ${sum}, ждали 16`);
    }
  };

  console.log('=== A. Разные границы при 2.5× (шаг 1/4) ===');
  await check('первая граница, +1 шаг',2.5,four,0,0.25);
  await check('вторая граница, +1 шаг',2.5,four,1,0.25);
  await check('третья граница, +1 шаг',2.5,four,2,0.25);

  console.log('\n=== B. Движение влево ===');
  await check('первая граница, -1 шаг',2.5,four,0,-0.25);
  await check('вторая граница, -1 шаг',2.5,four,1,-0.25);

  console.log('\n=== C. Длинные протяжки ===');
  await check('+1 доля (4 шага)',2.5,four,0,1);
  await check('+2 доли (8 шагов)',2.5,four,0,2);
  await check('-2 доли',2.5,four,1,-2);

  console.log('\n=== D. После прокрутки ряда ===');
  await check('прокрутка 50%, первая граница',2.5,four,0,0.25,0.5);
  await check('прокрутка 100%, третья граница',2.5,four,2,0.25,1);

  console.log('\n=== E. Уже дробные ячейки ===');
  const frac=[{c:'Am',s:0.5},{c:'F',s:3.5},{c:'C',s:4},{c:'G',s:8}];
  await check('дробная первая, +1 шаг',2.5,frac,0,0.25);
  await check('дробная первая, -1 шаг',2.5,frac,0,-0.25);

  console.log('\n=== F. Много мелких ячеек ===');
  const many=Array.from({length:8},(_,i)=>({c:'Am',s:2}));
  await check('8 ячеек по 2, граница #3',2.5,many,3,0.25);
  await check('8 ячеек, граница #6',3,many,6,0.25);

  console.log(fails?`\nПРОБЛЕМНЫХ СЛУЧАЕВ: ${fails}`:'\nвсе сценарии прошли');
  if(errs.length) console.log('ОШИБКИ СТРАНИЦЫ:',errs.slice(0,5));
  await b.close();
})();

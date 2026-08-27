// Горизонтальная прокрутка синхронна во всех секциях.
//
// Секции показывают одну песню в одной сетке долей: смотришь такт №5 в
// куплете — хочешь видеть такт №5 в припеве. Позиция передаётся как
// ДОЛЯ содержимого, а не пиксели: секции бывают разной длины, и
// одинаковый scrollLeft показывал бы в них разные места.
const puppeteer=require('puppeteer'); const fs=require('fs');
(async()=>{
  const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-dev-shm-usage']});
  const p=await b.newPage(); await p.setViewport({width:1300,height:900});
  let bad=0; const ok=(n,c,x)=>{console.log(`   ${c?'ok  ':'FAIL'} ${n}${!c&&x!==undefined?' — '+x:''}`);if(!c)bad++;};
  p.on('pageerror',e=>{console.log('   ОШИБКА:',String(e).split('\n')[0]);bad++;});
  await p.goto('file:///home/user/STRUCHORD.html',{waitUntil:'load'});
  await new Promise(r=>setTimeout(r,900));

  const build=async(lengths)=>{
    await p.evaluate((ls)=>{
      sections=[]; globalTimeSig='4/4';
      ls.forEach((n,i)=>{
        addSection(['Verse','Chorus','Bridge','Solo'][i%4]);
        const sec=sections[i];
        while(sec.squares.length<n) sec.squares.push({id:nextId++,repeat:1,customBeats:16,
          strumPattern:null,events:[{chord:'Am',span:4},{chord:'F',span:4},
          {chord:'C',span:4},{chord:'G',span:4}]});
      });
      setSquareZoom(2.5); render();
    },lengths);
    await new Promise(r=>setTimeout(r,700));
  };
  const fracs=()=>p.evaluate(()=>[...document.querySelectorAll('.squares-viewport')].map(v=>{
    const w=v.querySelector('.squares-list').getBoundingClientRect().width;
    return +(v.scrollLeft/w).toFixed(4);
  }));

  console.log('=== 1. Секции одинаковой длины ===');
  await build([8,8,8,8]);
  await p.evaluate(()=>{window.__ev=0;
    document.addEventListener('scroll',(e)=>{
      if(e.target&&e.target.classList&&e.target.classList.contains('squares-viewport')) window.__ev++;
    },{capture:true});});
  await p.evaluate(()=>{document.querySelectorAll('.squares-viewport')[0].scrollLeft=400;});
  await new Promise(r=>setTimeout(r,400));
  let f=await fracs();
  const ev=await p.evaluate(()=>window.__ev);
  console.log(`      доли: ${f.join(', ')} | событий scroll ${ev}`);
  ok('все секции сдвинулись', f.every(x=>x>0.01), JSON.stringify(f));
  ok('позиции совпадают', Math.max(...f)-Math.min(...f)<0.01,
     `разброс ${(Math.max(...f)-Math.min(...f)).toFixed(4)}`);
  // Зацикливание дало бы сотни событий: каждая запись рождает своё.
  ok('нет зацикливания', ev<=f.length*3, `${ev} событий на ${f.length} секций`);

  console.log('\n=== 2. Секции РАЗНОЙ длины ===');
  await build([8,4,6]);
  await p.evaluate(()=>{document.querySelectorAll('.squares-viewport')[1].scrollLeft=300;});
  await new Promise(r=>setTimeout(r,400));
  f=await fracs();
  const px=await p.evaluate(()=>[...document.querySelectorAll('.squares-viewport')]
    .map(v=>Math.round(v.scrollLeft)));
  console.log(`      пиксели: ${px.join(', ')}`);
  console.log(`      доли:    ${f.join(', ')}`);
  ok('синхронизация по доле, а не по пикселям',
     Math.max(...f)-Math.min(...f)<0.01, JSON.stringify(f));

  console.log('\n=== 3. Прокрутка колесом ===');
  await build([8,8,8]);
  await p.evaluate(()=>{document.querySelectorAll('.squares-viewport')[1]
    .scrollIntoView({block:'center'});});
  await new Promise(r=>setTimeout(r,300));
  const pt=await p.evaluate(()=>{
    const r=document.querySelectorAll('.squares-viewport')[1].getBoundingClientRect();
    return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+30)};});
  await p.mouse.move(pt.x,pt.y);
  for(let i=0;i<6;i++){await p.mouse.wheel({deltaX:60});await new Promise(r=>setTimeout(r,30));}
  await new Promise(r=>setTimeout(r,300));
  f=await fracs();
  console.log(`      доли: ${f.join(', ')}`);
  ok('колесо двигает все секции', f.every(x=>x>0.01), JSON.stringify(f));
  ok('позиции совпадают', Math.max(...f)-Math.min(...f)<0.01,
     `разброс ${(Math.max(...f)-Math.min(...f)).toFixed(4)}`);

  console.log('\n=== 4. Зум не сломан ===');
  const z0=await p.evaluate(()=>squareZoom);
  await p.keyboard.down('Control');
  for(let i=0;i<20;i++){await p.mouse.wheel({deltaY:-10});await new Promise(r=>setTimeout(r,10));}
  await p.keyboard.up('Control');
  const z1=await p.evaluate(()=>squareZoom);
  console.log(`      зум ${z0.toFixed(2)} -> ${z1.toFixed(2)}`);
  ok('зум работает', z1>z0, `${z0} -> ${z1}`);

  console.log('\n=== 5. Зум не порождает лишнюю синхронизацию ===');
  // applyZoomAnchor сам расставляет позиции всем секциям. Без метки
  // «это своё» каждое такое движение принималось за действие
  // пользователя: 50 шагов зума -> 400 вызовов syncScrollFrom, каждый
  // заново обходил секции и писал scrollLeft поверх.
  await build([8,8,8,8]);
  await p.evaluate(()=>{
    setSquareZoom(1); render();
    window.__real=0; window.__echo=0;
    const orig=window.syncScrollFrom;
    window.syncScrollFrom=function(src){
      if(scrollEchoExpected.has(src)) window.__echo++; else window.__real++;
      return orig.apply(this,arguments);
    };
  });
  await new Promise(r=>setTimeout(r,400));
  // Секция должна быть в окне, иначе курсор бьёт в пустоту и события
  // колеса до обработчика не доходят.
  await p.evaluate(()=>{document.querySelectorAll('.squares-viewport')[0]
    .scrollIntoView({block:'center'});});
  await new Promise(r=>setTimeout(r,300));
  const zpt=await p.evaluate(()=>{
    const r=document.querySelectorAll('.squares-viewport')[0].getBoundingClientRect();
    return {x:Math.round(r.left+r.width*0.7),y:Math.round(r.top+30)};});
  await p.mouse.move(zpt.x,zpt.y);
  await p.keyboard.down('Control');
  for(let i=0;i<40;i++){await p.mouse.wheel({deltaY:-10});await new Promise(r=>setTimeout(r,8));}
  await p.keyboard.up('Control');
  await new Promise(r=>setTimeout(r,300));
  const zr=await p.evaluate(()=>({e:window.__echo,rl:window.__real,z:squareZoom}));
  console.log(`      зум дошёл до ${zr.z.toFixed(2)}× | эхо ${zr.e}, принято за действие ${zr.rl}`);
  // Если зум не сработал, проверка бессмысленна — убеждаемся, что он был.
  ok('зум действительно применился', zr.z>1.3, `${zr.z.toFixed(2)}×`);
  ok('зум не вызывает повторную синхронизацию', zr.rl===0, `${zr.rl} лишних`);

  console.log(bad?`\n  ПРОВАЛОВ: ${bad}`:'\n  все проверки пройдены');
  await b.close();
  process.exitCode=bad?1:0;
})();

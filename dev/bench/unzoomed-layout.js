// При 1× вид должен быть в точности как до появления зума: кнопки
// квадрата видны целиком, прокрутки нет. При зуме — прокрутка есть,
// но кнопки достижимы.
const puppeteer=require('puppeteer');
(async()=>{
  const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-dev-shm-usage']});
  const p=await b.newPage();
  let bad=0; const ok=(n,c,x)=>{console.log(`   ${c?'ok  ':'FAIL'} ${n}${!c&&x!==undefined?' — '+x:''}`);if(!c)bad++;};
  p.on('pageerror',e=>{console.log('   ОШИБКА:',String(e).split('\n')[0]);bad++;});
  await p.setViewport({width:1440,height:900});
  await p.goto('file:///home/user/STRUCHORD.html',{waitUntil:'load'});
  await new Promise(r=>setTimeout(r,900));
  await p.evaluate(()=>{sections=[];addSection('Verse');
    const sq=sections[0].squares[0];
    sq.events=[{chord:'Am',span:4},{chord:'F',span:4},{chord:'C',span:4},{chord:'G',span:4}];
    sq.repeat=2; render();});
  await new Promise(r=>setTimeout(r,700));

  const probe=()=>p.evaluate(()=>{
    // Прокручивается .squares-viewport; .squares-row — внешняя обёртка,
    // в которой лежат ещё и кнопки «+»/«клонировать».
    const row=document.querySelector('.squares-viewport');
    const cs=getComputedStyle(row), rr=row.getBoundingClientRect();
    const g=(sel)=>{const el=document.querySelector(sel);if(!el)return null;
      const q=el.getBoundingClientRect();
      return {right:Math.round(q.right),w:Math.round(q.width),
              visible:q.width>0&&q.height>0};};
    return {
      zoomed:document.body.classList.contains('is-zoomed'),
      ox:cs.overflowX, oy:cs.overflowY,
      rowRight:Math.round(rr.right),
      // При overflow:visible scrollWidth/scrollHeight всё равно больше
      // clientWidth (они меряют выступающее содержимое), но прокрутки
      // при этом НЕТ. Настоящий признак — способность реально прокрутиться.
      hScroll:(()=>{const o=row.scrollLeft;row.scrollLeft=9999;
        const can=row.scrollLeft>0;row.scrollLeft=o;return can;})(),
      vScroll:(()=>{const o=row.scrollTop;row.scrollTop=9999;
        const can=row.scrollTop>0;row.scrollTop=o;return can;})(),
      del:g('.del-square-btn'), rep:g('.repeat-badge'), beats:g('.square-beats-badge'),
      maxScroll:row.scrollWidth-row.clientWidth,
    };
  });

  console.log('=== При 1× (зум не применён) ===');
  let r=await probe();
  console.log(`      overflow: x=${r.ox} y=${r.oy}, класс is-zoomed=${r.zoomed}`);
  console.log(`      прокрутка: гориз=${r.hScroll} верт=${r.vScroll}`);
  console.log(`      правый край ряда ${r.rowRight}; ✕ до ${r.del.right}, ×N до ${r.rep.right}, такты до ${r.beats.right}`);
  ok('класса is-zoomed нет', !r.zoomed);
  ok('нет горизонтальной прокрутки', !r.hScroll);
  ok('нет вертикальной прокрутки', !r.vScroll);
  ok('overflow-y не стал auto', r.oy!=='auto', r.oy);
  ok('кнопка ✕ не обрезана', r.del.visible && r.del.w>=20, JSON.stringify(r.del));
  ok('бейдж ×N не обрезан', r.rep.visible && r.rep.w>=20, JSON.stringify(r.rep));
  ok('число тактов не обрезано', r.beats.visible && r.beats.w>=30, JSON.stringify(r.beats));

  // Скриншот для глаза
  await p.screenshot({path:'/home/user/dev/bench/shot-1x.png'});

  console.log('\n=== При 2× (зум применён) ===');
  await p.evaluate(()=>setSquareZoom(2));
  await new Promise(r=>setTimeout(r,500));
  r=await probe();
  console.log(`      overflow: x=${r.ox} y=${r.oy}, класс is-zoomed=${r.zoomed}`);
  console.log(`      прокрутка: гориз=${r.hScroll}, запас ${r.maxScroll}px`);
  ok('класс is-zoomed есть', r.zoomed);
  ok('появилась горизонтальная прокрутка', r.hScroll);
  ok('вертикальной прокрутки нет', !r.vScroll);
  // Домотать вправо и проверить, что кнопки достижимы
  await p.evaluate(()=>{const row=document.querySelector('.squares-viewport');
    row.scrollLeft=row.scrollWidth;});
  await new Promise(r=>setTimeout(r,300));
  const r2=await p.evaluate(()=>{
    const row=document.querySelector('.squares-viewport').getBoundingClientRect();
    const el=document.querySelector('.del-square-btn').getBoundingClientRect();
    return {inside: el.right<=row.right+1 && el.left>=row.left-1,
            btnRight:Math.round(el.right), rowRight:Math.round(row.right)};
  });
  console.log(`      после прокрутки вправо: ✕ до ${r2.btnRight}, край ряда ${r2.rowRight}`);
  ok('до кнопок можно домотать', r2.inside, JSON.stringify(r2));
  await p.screenshot({path:'/home/user/dev/bench/shot-2x.png'});

  console.log('\n=== Возврат к 1× ===');
  await p.evaluate(()=>resetSquareZoom());
  await new Promise(r=>setTimeout(r,600));
  r=await probe();
  ok('класс снят', !r.zoomed);
  ok('прокрутка исчезла', !r.hScroll);
  ok('кнопки снова целы', r.del.visible&&r.rep.visible&&r.beats.visible);

  console.log(bad?`\n  ПРОВАЛОВ: ${bad}`:'\n  все проверки пройдены');
  await b.close();
  process.exitCode=bad?1:0;
})();

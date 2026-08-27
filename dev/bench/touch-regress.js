// Новые touch-обработчики зума не должны мешать прежним жестам:
// прокрутке ряда одним пальцем и долгому нажатию для перетаскивания секции.
const puppeteer=require('puppeteer');
const UA='Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
(async()=>{
  const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-dev-shm-usage']});
  const p=await b.newPage();
  let bad=0; const ok=(n,c,x)=>{console.log(`   ${c?'ok  ':'FAIL'} ${n}${!c&&x!==undefined?' — '+x:''}`);if(!c)bad++;};
  p.on('pageerror',e=>{console.log('   ОШИБКА:',String(e).split('\n')[0]);bad++;});
  await p.emulate({viewport:{width:834,height:1194,deviceScaleFactor:2,isMobile:true,hasTouch:true},userAgent:UA});
  await p.goto('file:///home/user/STRUCHORD.html',{waitUntil:'load'});
  await new Promise(r=>setTimeout(r,900));
  await p.evaluate(()=>{
    sections=[];
    ['Verse','Chorus'].forEach(t=>{
      addSection(t); const sec=sections[sections.length-1];
      while(sec.squares.length<8) sec.squares.push({id:nextId++,repeat:1,customBeats:16,
        strumPattern:null,events:[{chord:'Am',span:4},{chord:'F',span:4},
        {chord:'C',span:4},{chord:'G',span:4}]});
    });
    setSquareZoom(2.5); render();   // зум, чтобы ряд стал шире экрана
  });
  await new Promise(r=>setTimeout(r,700));
  const send=async(type,pts)=>p._client().send('Input.dispatchTouchEvent',{type,touchPoints:pts});
  const rb=await (await p.$('.squares-viewport')).boundingBox();
  const cy=Math.round(rb.y+30);

  console.log('=== Прокрутка ряда одним пальцем ===');
  const scrollable=await p.evaluate(()=>{
    const r=document.querySelector('.squares-viewport');
    return {sw:r.scrollWidth, cw:r.clientWidth};
  });
  console.log(`      содержимое ${scrollable.sw}px в окне ${scrollable.cw}px`);
  ok('ряд шире экрана (есть что прокручивать)', scrollable.sw>scrollable.cw);
  const zBefore=await p.evaluate(()=>squareZoom);
  await p.evaluate(()=>{document.querySelector('.squares-viewport').scrollLeft=0;});
  await send('touchStart',[{x:Math.round(rb.x+300),y:cy,id:1}]);
  for(let dx=0;dx<=120;dx+=20){
    await send('touchMove',[{x:Math.round(rb.x+300-dx),y:cy,id:1}]);
    await new Promise(r=>setTimeout(r,16));
  }
  await send('touchEnd',[]);
  const zAfter=await p.evaluate(()=>squareZoom);
  ok('масштаб при прокрутке не изменился', Math.abs(zBefore-zAfter)<1e-6, `${zBefore} -> ${zAfter}`);

  console.log('\n=== Долгое нажатие на шапке секции ===');
  const hdr=await (await p.$('.section-header')).boundingBox();
  const hx=Math.round(hdr.x+hdr.width/2), hy=Math.round(hdr.y+hdr.height/2);
  const zB2=await p.evaluate(()=>squareZoom);
  await send('touchStart',[{x:hx,y:hy,id:1}]);
  await new Promise(r=>setTimeout(r,400));   // дольше LONG_PRESS_DELAY
  const dragging=await p.evaluate(()=>typeof draggedItemId!=='undefined'&&draggedItemId!==null);
  await send('touchEnd',[]);
  await new Promise(r=>setTimeout(r,200));
  console.log(`      перетаскивание активировалось: ${dragging}`);
  ok('долгое нажатие всё ещё работает', dragging);
  ok('масштаб при этом не поехал', Math.abs(zB2-await p.evaluate(()=>squareZoom))<1e-6);

  console.log('\n=== Секции не съехали, приложение живо ===');
  const st=await p.evaluate(()=>({secs:sections.length,
    cards:document.querySelectorAll('.section-card').length,
    zoomOk:squareZoom>=1&&squareZoom<=4}));
  console.log(`      секций в модели ${st.secs}, карточек в DOM ${st.cards}`);
  ok('модель и DOM согласованы', st.secs===st.cards, `${st.secs} vs ${st.cards}`);
  ok('масштаб в допустимых границах', st.zoomOk);

  console.log(bad?`\n  ПРОВАЛОВ: ${bad}`:'\n  все проверки пройдены');
  await b.close();
  process.exitCode=bad?1:0;
})();

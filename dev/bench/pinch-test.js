// Щипок двумя пальцами на iPad-эмуляции + доступность ползунка пальцем.
const puppeteer=require('puppeteer');
const IPAD_UA='Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
(async()=>{
  const browser=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage();
  let bad=0; const ok=(n,c,x)=>{console.log(`   ${c?'ok  ':'FAIL'} ${n}${!c&&x!==undefined?' — '+x:''}`);if(!c)bad++;};
  page.on('pageerror',e=>{console.log('   ОШИБКА:',String(e).split('\n')[0]);bad++;});
  await page.emulate({viewport:{width:834,height:1194,deviceScaleFactor:2,isMobile:true,hasTouch:true},
    userAgent:IPAD_UA});
  await page.goto('file:///home/user/STRUCHORD.html',{waitUntil:'load'});
  await new Promise(r=>setTimeout(r,900));
  await page.evaluate(()=>{sections=[];addSection('Verse');
    sections[0].squares[0].events=[{chord:'Am',span:4},{chord:'F',span:4},
      {chord:'C',span:4},{chord:'G',span:4}];render();});
  await new Promise(r=>setTimeout(r,600));

  // Ползунок удалён: зум на тач-устройствах делается щипком, а
  // постоянная полоса под секцией занимала место и путала.
  console.log('=== Ползунка больше нет ===');
  const noSlider=await page.evaluate(()=>document.querySelectorAll('.zoom-slider').length);
  ok('ползунок удалён из разметки', noSlider===0, noSlider+' шт.');

  console.log('\n=== Щипок двумя пальцами (touch) ===');
  await page.evaluate(()=>setSquareZoom(1));
  const rb=await (await page.$('.squares-viewport')).boundingBox();
  const cy=Math.round(rb.y+30);
  const cx=Math.round(rb.x+200);

  // Разводим пальцы через CDP touch-события
  const send=async(type,points)=>{
    await page._client().send('Input.dispatchTouchEvent',{type,touchPoints:points});
  };
  const pt=(x,y,id)=>({x,y,id});
  await send('touchStart',[pt(cx-50,cy,1),pt(cx+50,cy,2)]);
  for(let d=50;d<=150;d+=10){
    await send('touchMove',[pt(cx-d,cy,1),pt(cx+d,cy,2)]);
    await new Promise(r=>setTimeout(r,16));
  }
  const zAfter=await page.evaluate(()=>squareZoom);
  await send('touchEnd',[]);
  console.log(`      развели пальцы 100px -> 300px: масштаб ${zAfter.toFixed(2)}×`);
  ok('щипок увеличивает масштаб', zAfter>1.5, zAfter.toFixed(2)+'×');

  // Сводим обратно
  await send('touchStart',[pt(cx-150,cy,1),pt(cx+150,cy,2)]);
  for(let d=150;d>=50;d-=10){
    await send('touchMove',[pt(cx-d,cy,1),pt(cx+d,cy,2)]);
    await new Promise(r=>setTimeout(r,16));
  }
  const zBack=await page.evaluate(()=>squareZoom);
  await send('touchEnd',[]);
  console.log(`      свели обратно: масштаб ${zBack.toFixed(2)}×`);
  ok('щипок уменьшает масштаб', zBack<zAfter, `${zAfter.toFixed(2)} -> ${zBack.toFixed(2)}`);

  // Один палец не должен зумить (это прокрутка)
  await page.evaluate(()=>setSquareZoom(1.5));
  const z1=await page.evaluate(()=>squareZoom);
  await send('touchStart',[pt(cx,cy,1)]);
  await send('touchMove',[pt(cx+80,cy,1)]);
  await send('touchEnd',[]);
  const z2=await page.evaluate(()=>squareZoom);
  ok('одним пальцем масштаб не меняется', Math.abs(z1-z2)<1e-6, `${z1} -> ${z2}`);

  console.log(bad?`\n  ПРОВАЛОВ: ${bad}`:'\n  все проверки пройдены');
  await browser.close();
  process.exitCode=bad?1:0;
})();

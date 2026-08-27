// Как зум ведёт себя на iPad (тач, без hover) и на мыши (крупные дискретные
// щелчки колеса), в отличие от трекпада с его потоком мелких дельт.
const puppeteer=require('puppeteer');

const IPAD={name:'iPad Pro 11',width:834,height:1194,dpr:2,
  ua:'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  touch:true};

(async()=>{
  const browser=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-dev-shm-usage']});

  // --- 1. iPad: есть ли вообще доступ к зуму ---
  console.log('=== iPad (тач, hover недоступен) ===');
  const p1=await browser.newPage();
  await p1.emulate({viewport:{width:IPAD.width,height:IPAD.height,deviceScaleFactor:IPAD.dpr,
    isMobile:true,hasTouch:true},userAgent:IPAD.ua});
  await p1.goto('file:///home/user/STRUCHORD.html',{waitUntil:'load'});
  await new Promise(r=>setTimeout(r,900));
  await p1.evaluate(()=>{sections=[];addSection('Verse');
    sections[0].squares[0].events=[{chord:'Am',span:4},{chord:'F',span:4},
      {chord:'C',span:4},{chord:'G',span:4}];render();});
  await new Promise(r=>setTimeout(r,500));

  const r1=await p1.evaluate(()=>{
    const sl=document.querySelector('.zoom-slider');
    const cs=sl?getComputedStyle(sl):null;
    return {
      hoverSupported: window.matchMedia('(hover: hover)').matches,
      coarse: window.matchMedia('(pointer: coarse)').matches,
      mediaQueryHits: window.innerWidth<=640,
      sliderExists: !!sl,
      sliderOpacity: cs?cs.opacity:null,
      sliderH: sl?Math.round(sl.getBoundingClientRect().height):0,
      sliderW: sl?Math.round(sl.getBoundingClientRect().width):0,
      hasGestureEvents: 'ongesturestart' in window,
      width: window.innerWidth,
    };
  });
  console.log(`  ширина окна ${r1.width}px -> медиазапрос 640px ${r1.mediaQueryHits?'сработал':'НЕ сработал'}`);
  console.log(`  (hover:hover)=${r1.hoverSupported}  (pointer:coarse)=${r1.coarse}`);
  console.log(`  ползунок: есть=${r1.sliderExists} прозрачность=${r1.sliderOpacity} размер=${r1.sliderW}x${r1.sliderH}px`);
  console.log(`  Safari GestureEvent доступен: ${r1.hasGestureEvents}`);

  // Пробуем дотянуться до ползунка пальцем
  const sl=await p1.$('.zoom-slider');
  if(sl){
    const b=await sl.boundingBox();
    console.log(`  область попадания пальцем: ${b?Math.round(b.width)+'x'+Math.round(b.height):'НЕТ'}px (норма >=44)`);
  }

  // Двухпальцевый щипок: шлёт ли Safari/Chrome wheel+ctrlKey на тач-устройстве?
  const before=await p1.evaluate(()=>squareZoom);
  const row=await p1.$('.squares-viewport');
  const rb=await row.boundingBox();
  try{
    await p1.touchscreen.tap(Math.round(rb.x+50),Math.round(rb.y+30));
  }catch(e){}
  const after=await p1.evaluate(()=>squareZoom);
  console.log(`  масштаб после тапа: ${before} -> ${after}`);

  // --- 2. Мышь: крупные дискретные щелчки ---
  console.log('\n=== Мышь (дискретные щелчки колеса) ===');
  const p2=await browser.newPage();
  await p2.setViewport({width:1440,height:900});
  await p2.goto('file:///home/user/STRUCHORD.html',{waitUntil:'load'});
  await new Promise(r=>setTimeout(r,900));
  await p2.evaluate(()=>{sections=[];addSection('Verse');
    sections[0].squares[0].events=[{chord:'Am',span:4},{chord:'F',span:4},
      {chord:'C',span:4},{chord:'G',span:4}];render();});
  await new Promise(r=>setTimeout(r,400));
  const rb2=await (await p2.$('.squares-viewport')).boundingBox();
  await p2.mouse.move(Math.round(rb2.x+rb2.width/2),Math.round(rb2.y+40));

  // Типичные значения deltaY одного щелчка в разных браузерах/ОС
  for(const [label,dy,mode] of [['Chrome/Win, 1 щелчок',-100,0],['Firefox, строки',-3,1],
                            ['macOS, 1 щелчок',-120,0],['крупный щелчок',-240,0]]){
    await p2.evaluate(()=>setSquareZoom(1));
    const z0=await p2.evaluate(()=>squareZoom);
    await p2.evaluate((d,m)=>{
      const row=document.querySelector('.squares-viewport');
      const e=new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:d,ctrlKey:true,
        clientX:row.getBoundingClientRect().left+100,clientY:row.getBoundingClientRect().top+20});
      if(m) Object.defineProperty(e,'deltaMode',{value:m});
      row.dispatchEvent(e);
    },dy,mode);
    const z1=await p2.evaluate(()=>squareZoom);
    console.log(`  ${label.padEnd(24)} deltaY=${String(dy).padStart(5)} -> ${z0.toFixed(2)}× → ${z1.toFixed(2)}× (${((z1/z0-1)*100).toFixed(1)}%)`);
  }

  // Сколько щелчков от 1× до 4×
  await p2.evaluate(()=>setSquareZoom(1));
  let clicks=0;
  while(await p2.evaluate(()=>squareZoom)<3.99 && clicks<200){
    await p2.evaluate(()=>{
      const row=document.querySelector('.squares-viewport');
      row.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:-100,ctrlKey:true}));
    });
    clicks++;
  }
  console.log(`  щелчков колеса от 1× до 4×: ${clicks}`);

  await browser.close();
})();

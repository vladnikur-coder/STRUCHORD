// Кто именно ест кадры: инструментируем подозреваемых счётчиками
// вызовов и суммарным временем, потом гоняем тот же жест.
const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-dev-shm-usage']});
  const page = await browser.newPage();
  await page.setViewport({width:1440,height:900});
  await page.goto('file:///home/user/STRUCHORD.html',{waitUntil:'load'});
  await new Promise(r=>setTimeout(r,800));
  const N=+process.argv[2]||8;
  await page.evaluate((n)=>{
    sections=[];
    ['Verse','Chorus','Bridge'].forEach(t=>{
      addSection(t); const sec=sections[sections.length-1];
      while(sec.squares.length<n) addSquare(sec.id);
      sec.squares.forEach(sq=>{sq.events=[{chord:'Am',span:4},{chord:'F',span:4},
        {chord:'Cmaj7',span:4},{chord:'G7',span:4}];});
    });
    setSquareZoom(1); render();
  }, N);
  await new Promise(r=>setTimeout(r,500));

  await page.evaluate(()=>{
    window.__prof={};
    const wrap=(name,getter,setter)=>{
      const orig=getter();
      window.__prof[name]={n:0,ms:0};
      setter(function(...a){
        const t=performance.now();
        try{return orig.apply(this,a);}finally{
          window.__prof[name].n++; window.__prof[name].ms+=performance.now()-t;}
      });
    };
    wrap('fitChordDisplay',()=>window.fitChordDisplay,f=>{window.fitChordDisplay=f;});
    wrap('render',()=>window.render,f=>{window.render=f;});
    wrap('updateZoomChrome',()=>window.updateZoomChrome,f=>{window.updateZoomChrome=f;});
    wrap('invalidateChordWrapperRects',()=>window.invalidateChordWrapperRects,
         f=>{window.invalidateChordWrapperRects=f;});
    wrap('applySquareZoom',()=>window.applySquareZoom,f=>{window.applySquareZoom=f;});
    wrap('flushChordFits',()=>window.flushChordFits,f=>{window.flushChordFits=f;});
    wrap('measureChordFullWidth',()=>window.measureChordFullWidth,f=>{window.measureChordFullWidth=f;});
  });

  const box=await (await page.$('.squares-viewport')).boundingBox();
  const vp=page.viewport();
  await page.mouse.move(Math.round(Math.min(box.x+box.width/2,vp.width-20)),
                        Math.round(Math.min(box.y+Math.min(box.height/2,60),vp.height-20)));
  await page.keyboard.down('Control');
  for(let i=0;i<90;i++){await page.mouse.wheel({deltaY:-6}); await new Promise(r=>setTimeout(r,16));}
  await page.keyboard.up('Control');
  await new Promise(r=>setTimeout(r,300));

  const zoom=await page.evaluate(()=>squareZoom);
  console.log('  масштаб после жеста:', zoom.toFixed(2)+'×');
  const prof=await page.evaluate(()=>window.__prof);
  console.log('  за ~1.5 сек жеста:');
  Object.entries(prof).sort((a,b)=>b[1].ms-a[1].ms).forEach(([k,v])=>{
    console.log(`    ${k.padEnd(28)} вызовов ${String(v.n).padStart(5)}  всего ${v.ms.toFixed(1).padStart(7)} мс`);
  });
  await browser.close();
})();

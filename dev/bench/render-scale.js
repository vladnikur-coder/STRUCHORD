// Как растёт стоимость одного render() с размером песни.
const puppeteer=require('puppeteer');
(async()=>{
  const browser=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage(); page.setDefaultTimeout(60000);
  await page.setViewport({width:1440,height:900});
  await page.goto('file:///home/user/STRUCHORD.html',{waitUntil:'load'});
  await new Promise(r=>setTimeout(r,800));
  for(const n of [16,24,32,48]){
    try{
      const r=await page.evaluate((n)=>{
        sections=[];
        ['Verse','Chorus','Bridge'].forEach(t=>{
          addSection(t); const sec=sections[sections.length-1];
          while(sec.squares.length<n) sec.squares.push({id:Math.random()*1e9|0,repeat:1,
            customBeats:null,strumPattern:null,
            events:[{chord:'Am',span:4},{chord:'F',span:4},{chord:'Cmaj7',span:4},{chord:'G7',span:4}]});
        });
        const t0=performance.now(); render(); const ms=performance.now()-t0;
        return {ms,cells:document.querySelectorAll('.chord-wrapper').length};
      },n);
      console.log(`  ${String(r.cells).padStart(4)} ячеек: render ${r.ms.toFixed(0)} мс`);
    }catch(e){console.log(`  ${n}: ТАЙМАУТ`); break;}
  }
  await browser.close();
})();

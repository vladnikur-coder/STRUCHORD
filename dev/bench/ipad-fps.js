// Кадры при щипке на iPad-эмуляции (dpr 2 — вчетверо больше пикселей).
const puppeteer=require('puppeteer');
const UA='Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
(async()=>{
  const N=+process.argv[2]||8;
  const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-dev-shm-usage']});
  const p=await b.newPage();
  await p.emulate({viewport:{width:834,height:1194,deviceScaleFactor:2,isMobile:true,hasTouch:true},userAgent:UA});
  await p.goto('file:///home/user/STRUCHORD.html',{waitUntil:'load'});
  await new Promise(r=>setTimeout(r,900));
  await p.evaluate((n)=>{
    sections=[];
    const per=Math.min(n,16), ns=Math.max(1,Math.ceil(n/per))*3;
    for(let i=0;i<ns;i++){
      addSection(['Verse','Chorus','Bridge'][i%3]);
      const sec=sections[sections.length-1];
      while(sec.squares.length<per) sec.squares.push({id:nextId++,repeat:1,customBeats:16,
        strumPattern:null,events:[{chord:'Am',span:4},{chord:'F',span:4},
        {chord:'Cmaj7',span:4},{chord:'G7',span:4}]});
    }
    setSquareZoom(1); render();
  },N);
  await new Promise(r=>setTimeout(r,600));
  const cells=await p.evaluate(()=>document.querySelectorAll('.chord-wrapper').length);

  await p.evaluate(()=>{window.__f=[];window.__c=true;let l=performance.now();
    const t=(x)=>{window.__f.push(x-l);l=x;if(window.__c)requestAnimationFrame(t);};
    requestAnimationFrame(t);});

  const rb=await (await p.$('.squares-viewport')).boundingBox();
  const cy=Math.round(rb.y+30), cx=Math.round(rb.x+200);
  const send=async(type,pts)=>p._client().send('Input.dispatchTouchEvent',{type,touchPoints:pts});
  await send('touchStart',[{x:cx-40,y:cy,id:1},{x:cx+40,y:cy,id:2}]);
  for(let d=40;d<=220;d+=3){
    await send('touchMove',[{x:cx-d,y:cy,id:1},{x:cx+d,y:cy,id:2}]);
    await new Promise(r=>setTimeout(r,16));
  }
  await send('touchEnd',[]);
  await new Promise(r=>setTimeout(r,200));
  const r=await p.evaluate(()=>{window.__c=false;
    const f=window.__f.slice(5).sort((a,b)=>a-b);
    return {p50:f[Math.floor(f.length/2)],p95:f[Math.floor(f.length*0.95)],
      max:f[f.length-1],over20:window.__f.filter(x=>x>20).length,n:f.length,z:squareZoom};});
  console.log(`  iPad(dpr2) ячеек ${cells}, масштаб ${r.z.toFixed(2)}×, кадров ${r.n}`);
  console.log(`  медиана ${r.p50.toFixed(1)} мс | p95 ${r.p95.toFixed(1)} | худший ${r.max.toFixed(1)} | просадок ${r.over20}`);
  console.log(`  => ${(1000/r.p50).toFixed(0)} fps`);
  await b.close();
})();

// Засечки при зуме: проверяем, что подсечки шага не ложатся поверх
// засечек долей, что метки не сливаются и что слабый слой различим.
//
// Позиции читаются из самого фонового градиента (там точные calc()),
// плюс контрольный замер по пикселям скриншота.
const puppeteer=require('puppeteer'); const fs=require('fs'); const {PNG}=require('pngjs');
(async()=>{
  const song=JSON.parse(fs.readFileSync('/home/user/dev/fixtures/wind-of-change.json','utf8'));
  const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-dev-shm-usage']});
  const p=await b.newPage(); await p.setViewport({width:1400,height:1000});
  let bad=0; const ok=(n,c,x)=>{console.log(`   ${c?'ok  ':'FAIL'} ${n}${!c&&x!==undefined?' — '+x:''}`);if(!c)bad++;};
  p.on('pageerror',e=>{console.log('   ОШИБКА:',String(e).split('\n')[0]);bad++;});
  await p.goto('file:///home/user/STRUCHORD.html',{waitUntil:'load'});
  await new Promise(r=>setTimeout(r,900));
  await p.evaluate(s=>{localStorage.setItem('struchord_songs',JSON.stringify([s]));loadSong(0);},song);
  await new Promise(r=>setTimeout(r,700));

  const scan=()=>{
    const SRC='calc\\(\\(\\(100% - ([\\d.]+)px\\) / (\\d+)\\) \\* ([\\d.]+) \\+ ([\\d.]+)px\\) - 1px';
    let cross=0, minGap=1e9, worst=null, cells=0, marks=0;
    document.querySelectorAll('.chord-wrapper').forEach(cw=>{
      const w=cw.getBoundingClientRect().width;
      if(!(w>1)) return;
      const layer=(sel)=>{
        const el=cw.querySelector(sel); if(!el) return [];
        const bg=el.style.backgroundImage||''; if(!bg) return [];
        const out=[]; const re=new RegExp(SRC,'g'); let m;
        while((m=re.exec(bg))){
          const colW=(w-(+m[1]))/(+m[2]);
          const px=colW*(+m[3])+(+m[4]);
          if(!out.length||Math.abs(out[out.length-1]-px)>0.01) out.push(px);
        }
        return out;
      };
      const beat=layer('.chord-ticks'), sub=layer('.chord-ticks-step');
      cells++; marks+=beat.length+sub.length;
      // наложение слоёв
      for(const s of sub) for(const t of beat) if(Math.abs(s-t)<1.5) cross++;
      const all=[...beat,...sub].sort((a,b)=>a-b);
      for(let i=1;i<all.length;i++){
        const d=all[i]-all[i-1];
        if(d<minGap){minGap=d;worst={w:Math.round(w),n:all.length};}
      }
    });
    return {cross,minGap:minGap===1e9?null:+minGap.toFixed(2),worst,cells,marks};
  };

  console.log('=== 1. Слои не накладываются, метки не сливаются ===');
  for(const z of [1,1.4,1.5,2,2.4,2.5,3,3.5,4]){
    await p.evaluate(zz=>setSquareZoom(zz,true),z);
    await new Promise(r=>setTimeout(r,350));
    const r=await p.evaluate(scan);
    console.log(`   зум ${z}: ячеек ${r.cells}, меток ${r.marks}, мин. просвет ${r.minGap}px`);
    ok(`зум ${z}: подсечки не поверх долей`, r.cross===0, `${r.cross} совпадений`);
    ok(`зум ${z}: просвет между метками > 6px`, r.minGap===null||r.minGap>6, `${r.minGap}px`);
  }

  console.log('\n=== 2. Контраст слоёв по пикселям (светлая тема) ===');
  await p.evaluate(()=>setSquareZoom(2.5,true));
  await new Promise(r=>setTimeout(r,450));
  const box=await p.evaluate(()=>{
    // Берём ячейку, целиком попадающую в окно: обрезанный клип даёт
    // невалидные параметры скриншота, а частичный — ложные пропуски меток.
    const list=[...document.querySelectorAll('.chord-wrapper')].filter(cw=>{
      const r=cw.getBoundingClientRect();
      return r.width>60 && r.x>=0 && r.x+r.width<=window.innerWidth && r.y>=0 && r.y+r.height<=window.innerHeight;
    });
    const cw=list[0]; if(!cw) return null;
    const r=cw.getBoundingClientRect();
    return {x:Math.floor(r.x),y:Math.floor(r.y),width:Math.floor(r.width),height:Math.floor(r.height)};
  });
  if(!box){console.log('   нет ячейки целиком в окне');process.exit(1);}
  const buf=await p.screenshot({clip:box});
  const png=PNG.sync.read(buf);
  const row=(dy)=>{const y=png.height-dy-1;const o=[];for(let x=0;x<png.width;x++){o.push(255-png.data[(y*png.width+x)*4]);}return o;};
  const peaks=(prof)=>{const out=[];let i=0;while(i<prof.length){if(prof[i]>=20){let j=i,mx=0;while(j<prof.length&&prof[j]>=20){mx=Math.max(mx,prof[j]);j++;}out.push({w:j-i,mx});i=j;}else i++;}return out;};
  const low=peaks(row(3));   // зона, где есть оба слоя
  const high=peaks(row(6));  // зона только засечек долей
  const beatVal=Math.max(...high.map(o=>o.mx));
  const subVal=Math.min(...low.map(o=>o.mx));
  const wMax=Math.max(...low.map(o=>o.w));
  console.log(`   доля ${beatVal}/255, подсечка ${subVal}/255, макс. ширина метки ${wMax}px, меток в нижней строке ${low.length}`);
  ok('подсечка различима (>= 45/255)', subVal>=45, String(subVal));
  ok('доля заметнее подсечки', beatVal>subVal+8, `${beatVal} vs ${subVal}`);
  ok('ни одна метка не толще 2px', wMax<=2, `${wMax}px`);
  ok('в зоне долей ровно засечки долей', high.every(o=>o.mx===beatVal));

  console.log('\n=== 3. Тёмная тема ===');
  await p.evaluate(()=>{document.documentElement.setAttribute('data-theme','dark');});
  await new Promise(r=>setTimeout(r,350));
  const buf2=await p.screenshot({clip:box});
  const png2=PNG.sync.read(buf2);
  const row2=(dy)=>{const y=png2.height-dy-1;const o=[];const base=png2.data[(y*png2.width+2)*4];for(let x=0;x<png2.width;x++){o.push(Math.abs(png2.data[(y*png2.width+x)*4]-base));}return o;};
  const low2=peaks(row2(3)), high2=peaks(row2(6));
  const bv=Math.max(...high2.map(o=>o.mx)), sv=Math.min(...low2.map(o=>o.mx));
  console.log(`   доля ${bv}/255, подсечка ${sv}/255`);
  ok('подсечка различима в тёмной теме (>= 45/255)', sv>=45, String(sv));
  ok('доля заметнее подсечки', bv>sv+8, `${bv} vs ${sv}`);

  console.log(bad?`\nПРОВАЛОВ: ${bad}`:'\nвсё зелено');
  await b.close(); process.exit(bad?1:0);
})();

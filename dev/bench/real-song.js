// Проверка на реальной песне пользователя (Wind of Change).
// Её секция Интро содержит то, чего не было в синтетических стендах:
// ячейки со СВОИМ размером 2/4 внутри такта 4/4. У такого квадрата
// логическая длина (12 долей) не равна визуальной (10), и смешение
// этих величин ломало и сетку засечек, и ресайз.
const puppeteer=require('puppeteer'); const fs=require('fs');
(async()=>{
  const song=JSON.parse(fs.readFileSync('/home/user/dev/fixtures/wind-of-change.json','utf8'));
  const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-dev-shm-usage']});
  const p=await b.newPage(); await p.setViewport({width:1400,height:1000});
  let bad=0; const ok=(n,c,x)=>{console.log(`   ${c?'ok  ':'FAIL'} ${n}${!c&&x!==undefined?' — '+x:''}`);if(!c)bad++;};
  p.on('pageerror',e=>{console.log('   ОШИБКА:',String(e).split('\n')[0]);bad++;});
  await p.goto('file:///home/user/STRUCHORD.html',{waitUntil:'load'});
  await new Promise(r=>setTimeout(r,900));
  const load=async(zoom)=>{
    await p.evaluate((s,z)=>{localStorage.setItem('struchord_songs',JSON.stringify([s]));
      loadSong(0); if(z!==1){setSquareZoom(z);render();}},song,zoom||1);
    await new Promise(r=>setTimeout(r,750));
  };

  console.log('=== 1. Песня открывается ===');
  await load(1);
  const meta=await p.evaluate(()=>({secs:sections.length,
    cards:document.querySelectorAll('.section-card').length,
    name:document.getElementById('songName')?.value||''}));
  console.log(`      секций ${meta.secs}, карточек ${meta.cards}`);
  ok('все секции отрисованы', meta.secs===meta.cards, `${meta.secs} vs ${meta.cards}`);

  console.log('\n=== 2. Единая сетка во ВСЕХ секциях ===');
  // Внутри секции доля должна занимать одинаковое расстояние, даже если
  // в одном квадрате есть ячейки со своим размером.
  const grids=await p.evaluate(()=>{
    return sections.map((sec,si)=>{
      const ts=sec.timeSig||globalTimeSig;
      const card=document.querySelectorAll('.section-card')[si];
      const vals=[...card.querySelectorAll('.square-inner')].map((inner,qi)=>{
        const sq=sec.squares[qi];
        const vis=getSquareVisualBeats(sq,ts);
        return +(inner.getBoundingClientRect().width/vis).toFixed(2);
      });
      return {si,type:sec.customName||sec.type,vals,
        spread:+(Math.max(...vals)-Math.min(...vals)).toFixed(2)};
    });
  });
  grids.forEach(g=>{
    console.log(`      ${String(g.si)}. ${g.type}: доля = ${g.vals.join(', ')}px`);
    ok(`секция «${g.type}»: доля одинакова`, g.spread<1, `разброс ${g.spread}px`);
  });

  console.log('\n=== 3. Ресайз не меняет длину квадрата ===');
  // Раньше каждое перетаскивание раздувало квадрат Интро: 10 -> 12 -> 14.
  const drag=async(secIdx,sqIdx,hi,dx)=>{
    const pos=await p.evaluate((si,qi,h)=>{
      const sq=document.querySelectorAll('.section-card')[si].querySelectorAll('.square')[qi];
      const el=sq.querySelectorAll('.resize-handle')[h];
      if(!el) return null;
      el.scrollIntoView({block:'nearest',inline:'center'});
      const r=el.getBoundingClientRect();
      return {x:r.x+r.width/2,y:r.y+r.height/2};
    },secIdx,sqIdx,hi);
    if(!pos) return false;
    await p.mouse.move(pos.x,pos.y); await p.mouse.down();
    const n=Math.max(6,Math.min(30,Math.abs(Math.round(dx/5))));
    for(let i=1;i<=n;i++){await p.mouse.move(pos.x+dx*i/n,pos.y);await new Promise(r=>setTimeout(r,10));}
    await p.mouse.up(); await new Promise(r=>setTimeout(r,330));
    return true;
  };
  for(const zoom of [1,2,2.5]){
    await load(zoom);
    const step=await p.evaluate(()=>getResizeStep());
    const px=await p.evaluate(()=>{
      const inner=document.querySelectorAll('.section-card')[0].querySelectorAll('.square-inner')[1];
      return inner.getBoundingClientRect().width/getSquareVisualBeats(sections[0].squares[1],'4/4');
    });
    const before=await p.evaluate(()=>getSquareVisualBeats(sections[0].squares[1],'4/4'));
    await drag(0,1,0,Math.round(px*step));
    const after=await p.evaluate(()=>({
      vis:getSquareVisualBeats(sections[0].squares[1],'4/4'),
      spans:sections[0].squares[1].events.map(e=>e.span)}));
    console.log(`      зум ${zoom}× (шаг ${step}): длина ${before} -> ${after.vis}, span ${JSON.stringify(after.spans)}`);
    ok(`зум ${zoom}×: длина квадрата не изменилась`, Math.abs(after.vis-before)<1e-6,
       `${before} -> ${after.vis}`);
  }

  console.log('\n=== 4. Серия протяжек не накапливает ошибку ===');
  await load(2.5);
  const px2=await p.evaluate(()=>{
    const inner=document.querySelectorAll('.section-card')[0].querySelectorAll('.square-inner')[1];
    return inner.getBoundingClientRect().width/getSquareVisualBeats(sections[0].squares[1],'4/4');
  });
  const seq=[];
  for(let i=0;i<5;i++){
    await drag(0,1,0,Math.round(px2*0.25));
    seq.push(await p.evaluate(()=>getSquareVisualBeats(sections[0].squares[1],'4/4')));
  }
  console.log(`      длина после 5 протяжек: ${seq.join(' -> ')}`);
  ok('длина стабильна', seq.every(v=>Math.abs(v-10)<1e-6), seq.join(','));

  console.log(bad?`\n  ПРОВАЛОВ: ${bad}`:'\n  все проверки пройдены');
  await b.close();
  process.exitCode=bad?1:0;
})();
